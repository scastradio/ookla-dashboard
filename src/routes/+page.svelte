<script lang="ts">
	import { Chart, GeoPath, GeoPoint, Svg } from 'layerchart';
	import { geoNaturalEarth1 } from 'd3-geo';
	import { scaleSqrt, scaleSequential } from 'd3-scale';
	import { interpolateBlues, interpolateRdYlGn } from 'd3-scale-chromatic';
	import { feature } from 'topojson-client';
	import { onMount } from 'svelte';
	import type { Topology } from 'topojson-specification';

	type Point = { area: string; lat: number; lng: number; value: number; count: number };
	type Provider = { provider: string; count: number };
	type Metric = { key: string; label: string; unit: string; higherIsBetter: boolean; color: (t: number) => string };

	const metrics: Metric[] = [
		{ key: 'dl_speed_mbps',  label: 'Download', unit: 'Mbps', higherIsBetter: true,  color: interpolateBlues },
		{ key: 'ul_speed_mbps',  label: 'Upload',   unit: 'Mbps', higherIsBetter: true,  color: interpolateRdYlGn },
		{ key: 'ave_latency_ms', label: 'Latency',  unit: 'ms',   higherIsBetter: false, color: (t) => interpolateRdYlGn(1 - t) }
	];

	function yesterday(): string {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return d.toISOString().slice(0, 10);
	}

	let selectedMetric: Metric = metrics[0];
	let geojson: ReturnType<typeof feature> | null = null;
	let points: Point[] = [];
	let providers: Provider[] = [];
	let loading = false;
	let error = '';

	let selectedDate = yesterday();
	let selectedProvider = 'rain';
	let minDate = '';
	let maxDate = '';

	let tooltip: { area: string; value: number; count: number } | null = null;
	let tooltipX = 0;
	let tooltipY = 0;

	let mounted = false;
	onMount(async () => {
		const [topoRes, dateRes, provRes] = await Promise.all([
			fetch('/world-110m.json'),
			fetch('/api/dates').then((r) => r.json()).catch(() => ({})),
			fetch('/api/providers').then((r) => r.json()).catch(() => ({ providers: [] }))
		]);

		const topo: Topology = await topoRes.json();
		geojson = feature(topo, topo.objects.countries as any);

		if (dateRes.min_date) {
			minDate = dateRes.min_date.slice(0, 10);
			maxDate = dateRes.max_date.slice(0, 10);
			// If yesterday falls outside DB range, use max available
			if (selectedDate > maxDate) selectedDate = maxDate;
			if (selectedDate < minDate) selectedDate = minDate;
		}

		if (provRes.providers?.length) {
			providers = provRes.providers;
			// Confirm 'rain' actually exists, otherwise use first provider
			const hasRain = providers.some((p) => p.provider.toLowerCase().includes('rain'));
			if (!hasRain && providers.length) selectedProvider = providers[0].provider;
		}

		await loadData();
		mounted = true;
	});

	async function loadData() {
		loading = true;
		error = '';
		try {
			const params = new URLSearchParams({
				metric: selectedMetric.key,
				date: selectedDate,
				provider: selectedProvider
			});
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

	$: if (mounted) { selectedMetric, selectedDate, selectedProvider; loadData(); }

	$: maxVal = Math.max(...points.map((p) => p.value), 1);
	$: minVal = Math.min(...points.map((p) => p.value), 0);

	$: rScale = scaleSqrt().domain([0, maxVal]).range([3, 30]).clamp(true);

	$: cScale = scaleSequential(selectedMetric.color).domain(
		selectedMetric.higherIsBetter ? [minVal, maxVal] : [maxVal, minVal]
	);

	$: totalTests = points.reduce((s, p) => s + p.count, 0);
	$: avgVal = totalTests
		? points.reduce((s, p) => s + p.value * p.count, 0) / totalTests
		: 0;
</script>

<div class="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
	<!-- Header -->
	<header class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Ookla Speed Test Map</h1>
			<p class="text-xs text-gray-500 mt-0.5">South Africa · aggregated by area</p>
		</div>
		<div class="text-sm text-gray-400 flex items-center gap-3">
			{#if totalTests > 0}
				<span>{totalTests.toLocaleString()} tests</span>
				<span class="text-gray-700">·</span>
				<span>
					avg {selectedMetric.label}:
					<strong class="text-white">{avgVal.toFixed(1)} {selectedMetric.unit}</strong>
				</span>
			{/if}
		</div>
	</header>

	<!-- Controls -->
	<div class="px-6 py-3 bg-gray-900 border-b border-gray-800 flex flex-wrap items-center gap-5">
		<!-- Metric -->
		<div class="flex rounded-md border border-gray-700 p-0.5 gap-0.5">
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

		<!-- Date -->
		<div class="flex items-center gap-2 text-sm">
			<label for="date-input" class="text-gray-500">Date</label>
			<input
				id="date-input"
				type="date"
				bind:value={selectedDate}
				min={minDate}
				max={maxDate}
				on:change={loadData}
				class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
			/>
		</div>

		<!-- Provider -->
		<div class="flex items-center gap-2 text-sm">
			<label for="provider-select" class="text-gray-500">Provider</label>
			{#if providers.length > 0}
				<select
					id="provider-select"
					bind:value={selectedProvider}
					on:change={loadData}
					class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
				>
					<option value="all">All providers</option>
					{#each providers as p}
						<option value={p.provider}>{p.provider} ({p.count.toLocaleString()})</option>
					{/each}
				</select>
			{:else}
				<input
					id="provider-select"
					type="text"
					bind:value={selectedProvider}
					placeholder="e.g. rain"
					on:change={loadData}
					class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm w-32 focus:outline-none focus:border-indigo-500"
				/>
			{/if}
		</div>

		{#if loading}
			<span class="text-xs text-indigo-400 animate-pulse ml-auto">Loading…</span>
		{/if}
		{#if error}
			<span class="text-xs text-red-400 ml-auto truncate max-w-xs" title={error}>⚠ {error}</span>
		{/if}
	</div>

	<!-- Map -->
	<div class="flex-1 min-h-0 relative">
		{#if geojson}
			<div class="absolute inset-0">
				<Chart
					geo={{ projection: geoNaturalEarth1, fitGeojson: geojson }}
					padding={{ top: 16, bottom: 16, left: 16, right: 16 }}
				>
				<Svg>
					{#each geojson.features as feat}
						<GeoPath
							geojson={feat}
							fill="#1f2937"
							stroke="#374151"
							style="stroke-width: 0.4px"
						/>
					{/each}

					{#each points as pt (pt.area)}
						<GeoPoint
							lat={pt.lat}
							long={pt.lng}
							on:pointerenter={(e) => {
								tooltip = { area: pt.area, value: pt.value, count: pt.count };
								tooltipX = e.clientX;
								tooltipY = e.clientY;
							}}
							on:pointermove={(e) => { tooltipX = e.clientX; tooltipY = e.clientY; }}
							on:pointerleave={() => { tooltip = null; }}
						>
							<circle
								r={rScale(pt.value)}
								fill={cScale(pt.value)}
								fill-opacity="0.72"
								stroke={cScale(pt.value)}
								stroke-width="0.5"
								stroke-opacity="0.9"
								style="cursor: pointer"
							/>
						</GeoPoint>
					{/each}
				</Svg>
			</Chart>
			</div>

			{#if points.length === 0 && !loading}
				<div class="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
					No data for {selectedDate} · {selectedProvider}
				</div>
			{/if}
		{:else}
			<div class="flex items-center justify-center h-full text-gray-500">Loading map…</div>
		{/if}

		<!-- Floating tooltip -->
		{#if tooltip}
			<div
				class="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg text-sm pointer-events-none"
				style="left:{tooltipX + 14}px; top:{tooltipY - 10}px"
			>
				<p class="font-semibold text-white mb-0.5">{tooltip.area}</p>
				<p class="text-gray-300">
					{selectedMetric.label}:
					<span class="font-semibold text-indigo-300">{tooltip.value.toFixed(2)} {selectedMetric.unit}</span>
				</p>
				<p class="text-gray-500 text-xs mt-0.5">{tooltip.count.toLocaleString()} tests</p>
			</div>
		{/if}
	</div>

	<!-- Footer legend -->
	{#if points.length > 0}
		<div class="px-6 py-2 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-500">
			<span>
				{selectedMetric.label} range:
				<strong class="text-gray-300">{minVal.toFixed(1)}</strong>
				–
				<strong class="text-gray-300">{maxVal.toFixed(1)} {selectedMetric.unit}</strong>
			</span>
			<span class="text-gray-700">·</span>
			<span>Bubble size &amp; colour ∝ {selectedMetric.label.toLowerCase()}</span>
			<span class="text-gray-700">·</span>
			<span>{points.length} areas</span>
		</div>
	{/if}
</div>
