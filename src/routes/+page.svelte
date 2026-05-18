<script lang="ts">
	import { interpolateBlues, interpolateRdYlGn } from 'd3-scale-chromatic';
	import { onMount } from 'svelte';
	import LeafletMap from '$lib/LeafletMap.svelte';

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

	let points: Point[] = [];
	let providers: Provider[] = [];
	let loading = false;
	let error = '';
	let mounted = false;

	let selectedMetric: Metric = metrics[0];
	let selectedDate = yesterday();
	let selectedProvider = 'rain';
	let minDate = '';
	let maxDate = '';

	let tooltip: { area: string; value: number; count: number; x: number; y: number } | null = null;

	onMount(async () => {
		const [dateRes, provRes] = await Promise.all([
			fetch('/api/dates').then((r) => r.json()).catch(() => ({})),
			fetch('/api/providers').then((r) => r.json()).catch(() => ({ providers: [] }))
		]);

		if (dateRes.min_date) {
			minDate = dateRes.min_date.slice(0, 10);
			maxDate = dateRes.max_date.slice(0, 10);
			if (selectedDate > maxDate) selectedDate = maxDate;
			if (selectedDate < minDate) selectedDate = minDate;
		}

		if (provRes.providers?.length) {
			providers = provRes.providers;
			const hasRain = providers.some((p) => p.provider.toLowerCase().includes('rain'));
			if (!hasRain) selectedProvider = providers[0].provider;
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

	$: if (mounted) { selectedMetric; selectedDate; selectedProvider; loadData(); }

	$: maxVal = Math.max(...points.map((p) => p.value), 1);
	$: minVal = Math.min(...points.map((p) => p.value), 0);

	$: colorFn = (t: number): string => {
		const normalised = maxVal > minVal ? (selectedMetric.higherIsBetter
			? (t - minVal) / (maxVal - minVal)
			: (maxVal - t) / (maxVal - minVal)) : 0;
		return selectedMetric.color(Math.max(0, Math.min(1, normalised)));
	};

	$: totalTests = points.reduce((s, p) => s + p.count, 0);
	$: avgVal = totalTests
		? points.reduce((s, p) => s + p.value * p.count, 0) / totalTests
		: 0;
</script>

<div class="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
	<!-- Header -->
	<header class="px-6 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Ookla Speed Test Map</h1>
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
	<div class="px-6 py-2 bg-gray-900 border-b border-gray-800 flex flex-wrap items-center gap-4 shrink-0">
		<!-- Metric -->
		<div class="flex rounded border border-gray-700 p-0.5 gap-0.5">
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
			<span class="text-xs text-indigo-400 animate-pulse">Loading…</span>
		{/if}
		{#if error}
			<span class="text-xs text-red-400 truncate max-w-xs" title={error}>⚠ {error}</span>
		{/if}
	</div>

	<!-- Map -->
	<div class="flex-1 min-h-0 relative">
		<LeafletMap
			{points}
			metricLabel={selectedMetric.label}
			metricUnit={selectedMetric.unit}
			colorFn={colorFn}
			{maxVal}
			{minVal}
			on:hover={(e) => { tooltip = e.detail; }}
		/>

		{#if points.length === 0 && !loading && mounted}
			<div class="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none z-10">
				No data for {selectedDate} · {selectedProvider}
			</div>
		{/if}
	</div>

	<!-- Footer legend -->
	{#if points.length > 0}
		<div class="px-6 py-2 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-500 shrink-0">
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

<!-- Tooltip -->
{#if tooltip}
	<div
		class="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg text-sm pointer-events-none"
		style="left:{tooltip.x + 14}px; top:{tooltip.y - 10}px"
	>
		<p class="font-semibold text-white mb-0.5">{tooltip.area}</p>
		<p class="text-gray-300">
			{selectedMetric.label}:
			<span class="font-semibold text-indigo-300">{tooltip.value.toFixed(2)} {selectedMetric.unit}</span>
		</p>
		<p class="text-gray-500 text-xs mt-0.5">{tooltip.count.toLocaleString()} tests</p>
	</div>
{/if}
