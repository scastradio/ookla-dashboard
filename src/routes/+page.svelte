<script lang="ts">
	import { interpolateBlues, interpolateRdYlGn } from 'd3-scale-chromatic';
	import { onMount } from 'svelte';
	import LeafletMap from '$lib/LeafletMap.svelte';

	type Point     = { area: string; lat: number; lng: number; value: number; count: number };
	type LeetPoint = { area: string; provider: string; lat: number; lng: number; value: number; count: number };
	type Provider  = { provider: string; count: number };
	type Metric    = { key: string; label: string; unit: string; higherIsBetter: boolean; color: (t: number) => string };

	const metrics: Metric[] = [
		{ key: 'dl_speed_mbps',  label: 'Download', unit: 'Mbps', higherIsBetter: true,  color: interpolateBlues },
		{ key: 'ul_speed_mbps',  label: 'Upload',   unit: 'Mbps', higherIsBetter: true,  color: interpolateRdYlGn },
		{ key: 'ave_latency_ms', label: 'Latency',  unit: 'ms',   higherIsBetter: false, color: (t) => interpolateRdYlGn(1 - t) }
	];

	function yesterday(): string {
		const d = new Date(); d.setDate(d.getDate() - 1);
		return d.toISOString().slice(0, 10);
	}

	// Deterministic provider colour (must match LeafletMap)
	function providerColor(provider: string): string {
		let hash = 0;
		for (let i = 0; i < provider.length; i++) { hash = ((hash << 5) - hash) + provider.charCodeAt(i); hash |= 0; }
		return `hsl(${Math.abs(hash) % 360},70%,58%)`;
	}

	let points: Point[] = [];
	let leetPoints: LeetPoint[] = [];
	let providers: Provider[] = [];
	let loading = false;
	let leetLoading = false;
	let error = '';
	let mounted = false;
	let leet = false;

	let selectedMetric: Metric = metrics[0];
	let selectedDate = yesterday();
	let selectedProvider = 'rain';
	let minDate = '';
	let maxDate = '';

	type HoverData = { area: string; value: number; count: number; provider?: string; x: number; y: number } | null;
	let tooltip: HoverData = null;

	// Group leet points by area for bar chart tooltip
	$: leetByArea = leetPoints.reduce((acc, p) => {
		if (!acc[p.area]) acc[p.area] = [];
		acc[p.area].push(p);
		return acc;
	}, {} as Record<string, LeetPoint[]>);

	$: tooltipAreaProviders = tooltip?.area
		? (leetByArea[tooltip.area] ?? []).sort((a, b) => b.value - a.value)
		: [];
	$: barMax = tooltipAreaProviders.length ? tooltipAreaProviders[0].value : 1;

	onMount(async () => {
		const [dateRes, provRes] = await Promise.all([
			fetch('/api/dates').then(r => r.json()).catch(() => ({})),
			fetch('/api/providers').then(r => r.json()).catch(() => ({ providers: [] }))
		]);
		if (dateRes.min_date) {
			minDate = dateRes.min_date.slice(0, 10);
			maxDate = dateRes.max_date.slice(0, 10);
			if (selectedDate > maxDate) selectedDate = maxDate;
			if (selectedDate < minDate) selectedDate = minDate;
		}
		if (provRes.providers?.length) {
			providers = provRes.providers;
			if (!providers.some(p => p.provider.toLowerCase().includes('rain')))
				selectedProvider = providers[0].provider;
		}
		await loadData();
		mounted = true;
	});

	async function loadData() {
		loading = true; error = '';
		try {
			const params = new URLSearchParams({ metric: selectedMetric.key, date: selectedDate, provider: selectedProvider });
			const res = await fetch(`/api/speedtests?${params}`);
			const data = await res.json();
			if (data.error) throw new Error(data.error);
			points = data.points ?? [];
		} catch (e) { error = e instanceof Error ? e.message : String(e); points = []; }
		finally { loading = false; }
	}

	async function loadLeet() {
		leetLoading = true;
		try {
			const params = new URLSearchParams({ metric: selectedMetric.key, date: selectedDate });
			const res = await fetch(`/api/leet?${params}`);
			const data = await res.json();
			if (data.error) throw new Error(data.error);
			leetPoints = data.points ?? [];
		} catch (e) { error = e instanceof Error ? e.message : String(e); leetPoints = []; }
		finally { leetLoading = false; }
	}

	async function toggleLeet() {
		leet = !leet;
		if (leet && leetPoints.length === 0) await loadLeet();
	}

	$: if (mounted) { selectedMetric; selectedDate; selectedProvider; loadData(); if (leet) loadLeet(); }

	$: maxVal = Math.max(...points.map(p => p.value), 1);
	$: minVal = Math.min(...points.map(p => p.value), 0);
	$: colorFn = (t: number): string => {
		const n = maxVal > minVal ? (selectedMetric.higherIsBetter ? t : 1 - t) : 0;
		return selectedMetric.color(Math.max(0, Math.min(1, n)));
	};
	$: totalTests  = points.reduce((s, p) => s + p.count, 0);
	$: avgVal      = totalTests ? points.reduce((s, p) => s + p.value * p.count, 0) / totalTests : 0;
</script>

<div class="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
	<!-- Header -->
	<header class="px-6 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Ookla Speed Test Map</h1>
			<p class="text-xs text-gray-500 mt-0.5">South Africa · aggregated by area</p>
		</div>
		<div class="text-sm text-gray-400 flex items-center gap-3">
			{#if totalTests > 0 && !leet}
				<span>{totalTests.toLocaleString()} tests</span>
				<span class="text-gray-700">·</span>
				<span>avg {selectedMetric.label}: <strong class="text-white">{avgVal.toFixed(1)} {selectedMetric.unit}</strong></span>
			{/if}
			{#if leet && leetPoints.length > 0}
				<span class="text-green-400 font-mono text-xs">{leetPoints.length} provider×area combos</span>
			{/if}
		</div>
	</header>

	<!-- Controls -->
	<div class="px-6 py-2 bg-gray-900 border-b border-gray-800 flex flex-wrap items-center gap-4 shrink-0">
		<!-- Metric -->
		<div class="flex rounded border border-gray-700 p-0.5 gap-0.5">
			{#each metrics as m}
				<button
					class="px-3 py-1 rounded text-sm transition-colors {selectedMetric.key === m.key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}"
					on:click={() => { selectedMetric = m; }}>{m.label}</button>
			{/each}
		</div>

		<!-- Date -->
		<div class="flex items-center gap-2 text-sm">
			<label for="date-input" class="text-gray-500">Date</label>
			<input id="date-input" type="date" bind:value={selectedDate} min={minDate} max={maxDate} on:change={loadData}
				class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-indigo-500" />
		</div>

		<!-- Provider (hidden in leet mode) -->
		{#if !leet}
			<div class="flex items-center gap-2 text-sm">
				<label for="provider-select" class="text-gray-500">Provider</label>
				{#if providers.length > 0}
					<select id="provider-select" bind:value={selectedProvider} on:change={loadData}
						class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm focus:outline-none focus:border-indigo-500">
						<option value="all">All providers</option>
						{#each providers as p}
							<option value={p.provider}>{p.provider} ({p.count.toLocaleString()})</option>
						{/each}
					</select>
				{:else}
					<input id="provider-select" type="text" bind:value={selectedProvider} placeholder="e.g. rain" on:change={loadData}
						class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-sm w-32 focus:outline-none focus:border-indigo-500" />
				{/if}
			</div>
		{/if}

		<!-- 1337 toggle -->
		<button
			on:click={toggleLeet}
			class="ml-auto px-4 py-1.5 rounded border font-mono text-sm font-bold tracking-widest transition-all
				{leet
					? 'bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_12px_rgba(74,222,128,0.4)]'
					: 'border-gray-600 text-gray-500 hover:border-green-600 hover:text-green-500'}"
		>
			1337
		</button>

		{#if loading || leetLoading}
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
			{leetPoints}
			{leet}
			metricLabel={selectedMetric.label}
			metricUnit={selectedMetric.unit}
			{colorFn}
			{maxVal}
			{minVal}
			on:hover={(e) => { tooltip = e.detail; }}
		/>
		{#if !loading && !leetLoading && mounted && (leet ? leetPoints.length === 0 : points.length === 0)}
			<div class="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none z-10">
				No data for {selectedDate}
			</div>
		{/if}
	</div>

	<!-- Footer legend -->
	{#if !leet && points.length > 0}
		<div class="px-6 py-2 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-500 shrink-0">
			<span>{selectedMetric.label} range: <strong class="text-gray-300">{minVal.toFixed(1)}</strong> – <strong class="text-gray-300">{maxVal.toFixed(1)} {selectedMetric.unit}</strong></span>
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
		class="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-xl shadow-xl text-sm pointer-events-none"
		style="left:{tooltip.x + 16}px; top:{tooltip.y - 12}px; min-width: 220px; max-width: 300px;"
	>
		{#if leet && tooltipAreaProviders.length > 0}
			<!-- 1337 mode: bar chart of all providers for this area -->
			<div class="px-4 pt-3 pb-1 border-b border-gray-800">
				<p class="font-semibold text-white text-sm">{tooltip.area}</p>
				<p class="text-xs text-gray-500 mt-0.5">{selectedMetric.label} by provider</p>
			</div>
			<div class="px-4 py-3 space-y-1.5">
				{#each tooltipAreaProviders as p}
					<div class="flex items-center gap-2">
						<div class="w-2 h-2 rounded-full shrink-0" style="background:{providerColor(p.provider)}"></div>
						<span class="text-gray-300 truncate text-xs w-28 shrink-0">{p.provider}</span>
						<div class="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
							<div class="h-full rounded-full transition-all"
								style="width:{(p.value / barMax) * 100}%; background:{providerColor(p.provider)}">
							</div>
						</div>
						<span class="text-xs font-mono text-gray-300 shrink-0 w-14 text-right">
							{p.value.toFixed(1)} {selectedMetric.unit}
						</span>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Normal mode: simple tooltip -->
			<div class="px-4 py-3">
				<p class="font-semibold text-white mb-1">{tooltip.area}</p>
				<p class="text-gray-300">{selectedMetric.label}: <span class="font-semibold text-indigo-300">{tooltip.value.toFixed(2)} {selectedMetric.unit}</span></p>
				<p class="text-gray-500 text-xs mt-0.5">{tooltip.count.toLocaleString()} tests</p>
			</div>
		{/if}
	</div>
{/if}
