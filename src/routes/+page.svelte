<script lang="ts">
	import { Chart, GeoPath, GeoPoint, Svg, Tooltip } from 'layerchart';
	import { geoNaturalEarth1 } from 'd3-geo';
	import { scaleSqrt, scaleSequential } from 'd3-scale';
	import { interpolateRdYlGn, interpolateBlues } from 'd3-scale-chromatic';
	import { feature } from 'topojson-client';
	import { onMount } from 'svelte';
	import type { Topology } from 'topojson-specification';

	type Point = {
		area: string;
		lat: number;
		lng: number;
		value: number;
		count: number;
	};

	type Metric = {
		key: string;
		label: string;
		unit: string;
		higherIsBetter: boolean;
		colorScheme: (t: number) => string;
	};

	const metrics: Metric[] = [
		{
			key: 'dl_speed_mbps',
			label: 'Download',
			unit: 'Mbps',
			higherIsBetter: true,
			colorScheme: interpolateBlues
		},
		{
			key: 'ul_speed_mbps',
			label: 'Upload',
			unit: 'Mbps',
			higherIsBetter: true,
			colorScheme: (t: number) => interpolateRdYlGn(t)
		},
		{
			key: 'ave_latency_ms',
			label: 'Latency',
			unit: 'ms',
			higherIsBetter: false,
			colorScheme: (t: number) => interpolateRdYlGn(1 - t)
		}
	];

	let selectedMetric: Metric = metrics[0];
	let geojson: ReturnType<typeof feature> | null = null;
	let points: Point[] = [];
	let loading = false;
	let error = '';
	let tooltip: { area: string; value: number; count: number } | null = null;
	let tooltipX = 0;
	let tooltipY = 0;

	let fromDate = '';
	let toDate = '';
	let minDate = '';
	let maxDate = '';

	onMount(async () => {
		const [topoRes, dateRes] = await Promise.all([
			fetch('/world-110m.json'),
			fetch('/api/dates').then((r) => r.json()).catch(() => ({}))
		]);
		const topo: Topology = await topoRes.json();
		geojson = feature(topo, topo.objects.countries as any);

		if (dateRes.min_date) {
			minDate = dateRes.min_date.slice(0, 10);
			maxDate = dateRes.max_date.slice(0, 10);
			fromDate = minDate;
			toDate = maxDate;
		}

		await loadData();
	});

	async function loadData() {
		loading = true;
		error = '';
		try {
			const params = new URLSearchParams({ metric: selectedMetric.key });
			if (fromDate) params.set('from', fromDate);
			if (toDate) params.set('to', toDate);
			const res = await fetch(`/api/speedtests?${params}`);
			const data = await res.json();
			if (data.error) throw new Error(data.error);
			points = data.points ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			points = [];
		} finally {
			loading = false;
		}
	}

	$: if (selectedMetric) loadData();

	$: maxValue = Math.max(...points.map((p) => p.value), 1);
	$: minValue = Math.min(...points.map((p) => p.value), 0);

	$: radiusScale = scaleSqrt()
		.domain([0, maxValue])
		.range([2, 28])
		.clamp(true);

	$: colorScale = scaleSequential(selectedMetric.colorScheme).domain(
		selectedMetric.higherIsBetter ? [minValue, maxValue] : [maxValue, minValue]
	);

	$: avgValue = points.length
		? points.reduce((s, p) => s + p.value * p.count, 0) / points.reduce((s, p) => s + p.count, 0)
		: 0;
	$: totalTests = points.reduce((s, p) => s + p.count, 0);
</script>

<div class="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
	<!-- Header -->
	<header class="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Ookla Speed Test Map</h1>
			<p class="text-xs text-gray-500 mt-0.5">South Africa — aggregated by area</p>
		</div>
		<div class="flex items-center gap-3 text-sm">
			{#if totalTests > 0}
				<span class="text-gray-400">{totalTests.toLocaleString()} tests</span>
				<span class="text-gray-600">·</span>
				<span class="text-gray-400">
					avg {selectedMetric.label}: <strong class="text-white"
						>{avgValue.toFixed(1)} {selectedMetric.unit}</strong
					>
				</span>
			{/if}
		</div>
	</header>

	<!-- Controls -->
	<div class="flex items-center gap-6 px-6 py-3 border-b border-gray-800 bg-gray-900">
		<!-- Metric toggle -->
		<div class="flex items-center gap-1 rounded-md border border-gray-700 p-0.5">
			{#each metrics as m}
				<button
					class="px-3 py-1 rounded text-sm transition-colors {selectedMetric.key === m.key
						? 'bg-indigo-600 text-white'
						: 'text-gray-400 hover:text-gray-200'}"
					on:click={() => { selectedMetric = m; }}
				>
					{m.label}
				</button>
			{/each}
		</div>

		<!-- Date filters -->
		<div class="flex items-center gap-2 text-sm">
			<label class="text-gray-500">From</label>
			<input
				type="date"
				bind:value={fromDate}
				min={minDate}
				max={toDate || maxDate}
				on:change={loadData}
				class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
			/>
			<label class="text-gray-500">To</label>
			<input
				type="date"
				bind:value={toDate}
				min={fromDate || minDate}
				max={maxDate}
				on:change={loadData}
				class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
			/>
		</div>

		{#if loading}
			<span class="text-xs text-indigo-400 animate-pulse">Loading…</span>
		{/if}
		{#if error}
			<span class="text-xs text-red-400">Error: {error}</span>
		{/if}
	</div>

	<!-- Map -->
	<div class="flex-1 relative" style="min-height: 520px;">
		{#if geojson}
			<Chart
				geo={{
					projection: geoNaturalEarth1,
					fitGeojson: geojson
				}}
				padding={{ top: 20, bottom: 20, left: 20, right: 20 }}
			>
				<Svg>
					<!-- Base map -->
					{#each geojson.features as feat}
						<GeoPath
							geojson={feat}
							class="fill-gray-800 stroke-gray-700"
							style="stroke-width: 0.4px"
						/>
					{/each}

					<!-- Bubbles -->
					{#each points as point (point.area)}
						<GeoPoint
							lat={point.lat}
							long={point.lng}
							on:pointerenter={(e) => {
								tooltip = { area: point.area, value: point.value, count: point.count };
								tooltipX = e.clientX;
								tooltipY = e.clientY;
							}}
							on:pointerleave={() => { tooltip = null; }}
						>
							<circle
								r={radiusScale(point.value)}
								fill={colorScale(point.value)}
								fill-opacity="0.75"
								stroke={colorScale(point.value)}
								stroke-width="0.5"
								stroke-opacity="0.9"
								style="cursor: pointer;"
							/>
						</GeoPoint>
					{/each}
				</Svg>
			</Chart>
		{:else}
			<div class="flex items-center justify-center h-full text-gray-500">
				Loading map…
			</div>
		{/if}

		<!-- Tooltip -->
		{#if tooltip}
			<div
				class="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg text-sm pointer-events-none"
				style="left: {tooltipX + 12}px; top: {tooltipY - 8}px;"
			>
				<div class="font-medium text-white mb-1">{tooltip.area}</div>
				<div class="text-gray-300">
					{selectedMetric.label}: <span class="text-indigo-300 font-semibold"
						>{tooltip.value.toFixed(2)} {selectedMetric.unit}</span
					>
				</div>
				<div class="text-gray-500 text-xs mt-0.5">{tooltip.count.toLocaleString()} tests</div>
			</div>
		{/if}
	</div>

	<!-- Legend -->
	{#if points.length > 0}
		<div class="px-6 py-3 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-500">
			<span>
				{selectedMetric.label} range:
				<strong class="text-gray-300">{minValue.toFixed(1)}</strong>
				–
				<strong class="text-gray-300">{maxValue.toFixed(1)} {selectedMetric.unit}</strong>
			</span>
			<span class="text-gray-700">·</span>
			<span>Bubble size &amp; color proportional to {selectedMetric.label.toLowerCase()}</span>
			<span class="text-gray-700">·</span>
			<span>{points.length} areas</span>
		</div>
	{/if}
</div>
