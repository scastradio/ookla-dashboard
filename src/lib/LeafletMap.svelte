<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

	export let points: { area: string; provider: string; lat: number; lng: number; value: number; test_date: string }[] = [];
	export let leetPoints: { area: string; provider: string; lat: number; lng: number; value: number; count: number }[] = [];
	export let leet = false;
	export let metricLabel = 'Download';
	export let metricUnit = 'Mbps';
	export let colorFn: (value: number) => string = () => '#6366f1';
	export let maxVal = 1;
	export let minVal = 0;

	const dispatch = createEventDispatcher<{
		hover: { area: string; value: number; provider?: string; test_date?: string; x: number; y: number } | null
	}>();

	let mapEl: HTMLDivElement;
	let L: typeof import('leaflet');
	let map: import('leaflet').Map;
	let circleLayer: import('leaflet').LayerGroup;

	const SA_CENTER: [number, number] = [-29.0, 25.0];
	const SA_BOUNDS = [[-35.0, 16.0], [-22.0, 33.5]] as [[number, number], [number, number]];

	// Deterministic colour per provider name
	function providerColor(provider: string): string {
		let hash = 0;
		for (let i = 0; i < provider.length; i++) {
			hash = ((hash << 5) - hash) + provider.charCodeAt(i);
			hash |= 0;
		}
		const hue = Math.abs(hash) % 360;
		return `hsl(${hue},70%,58%)`;
	}

	function radiusForValue(val: number, max: number): number {
		if (max <= 0) return 5;
		return 3 + (val / max) * 22;
	}

	onMount(async () => {
		L = (await import('leaflet')).default;
		await import('leaflet/dist/leaflet.css');

		map = L.map(mapEl, {
			center: SA_CENTER,
			zoom: 6,
			minZoom: 5,
			maxZoom: 14,
			maxBounds: SA_BOUNDS,
			maxBoundsViscosity: 0.85,
		});

		L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
			subdomains: 'abcd',
			maxZoom: 19,
		}).addTo(map);

		circleLayer = L.layerGroup().addTo(map);
		renderCircles();
	});

	onDestroy(() => { map?.remove(); });

	function renderCircles() {
		if (!L || !circleLayer) return;
		circleLayer.clearLayers();

		if (leet) {
			const maxLeet = Math.max(...leetPoints.map(p => p.value), 1);
			for (const pt of leetPoints) {
				if (!pt.lat || !pt.lng) continue;
				const color = providerColor(pt.provider);
				const radius = radiusForValue(pt.value, maxLeet);

				const circle = L.circleMarker([pt.lat, pt.lng], {
					radius,
					fillColor: color,
					fillOpacity: 0.72,
					color,
					weight: 1,
					opacity: 0.9,
				});

				circle.on('mouseover', (e) => {
					circle.setStyle({ fillOpacity: 1, weight: 2 });
					dispatch('hover', { area: pt.area, provider: pt.provider, value: pt.value, count: pt.count, x: e.originalEvent.clientX, y: e.originalEvent.clientY });
				});
				circle.on('mousemove', (e) => {
					dispatch('hover', { area: pt.area, provider: pt.provider, value: pt.value, count: pt.count, x: e.originalEvent.clientX, y: e.originalEvent.clientY });
				});
				circle.on('mouseout', () => {
					circle.setStyle({ fillOpacity: 0.72, weight: 1 });
					dispatch('hover', null);
				});
				circleLayer.addLayer(circle);
			}
		} else {
			for (const pt of points) {
				if (!pt.lat || !pt.lng) continue;
				const t = maxVal > minVal ? (pt.value - minVal) / (maxVal - minVal) : 0;
				const color = colorFn(Math.max(0, Math.min(1, t)));
				const radius = radiusForValue(pt.value, maxVal);

				const circle = L.circleMarker([pt.lat, pt.lng], {
					radius,
					fillColor: color,
					fillOpacity: 0.75,
					color,
					weight: 1,
					opacity: 0.9,
				});

				circle.on('mouseover', (e) => {
					circle.setStyle({ fillOpacity: 1, weight: 2 });
					dispatch('hover', { area: pt.area, value: pt.value, provider: pt.provider, test_date: pt.test_date, x: e.originalEvent.clientX, y: e.originalEvent.clientY });
				});
				circle.on('mousemove', (e) => {
					dispatch('hover', { area: pt.area, value: pt.value, provider: pt.provider, test_date: pt.test_date, x: e.originalEvent.clientX, y: e.originalEvent.clientY });
				});
				circle.on('mouseout', () => {
					circle.setStyle({ fillOpacity: 0.75, weight: 1 });
					dispatch('hover', null);
				});
				circle.bindPopup(
					`<strong>${pt.area}</strong><br/>${pt.provider}<br/>${metricLabel}: <strong>${pt.value.toFixed(2)} ${metricUnit}</strong><br/><span style="color:#9ca3af;font-size:11px">${pt.test_date?.slice(0,16) ?? ''}</span>`,
					{ className: 'ookla-popup' }
				);
				circleLayer.addLayer(circle);
			}
		}
	}

	$: if (circleLayer) { points; leetPoints; leet; maxVal; minVal; renderCircles(); }

	// Exported so page can look up provider colour for legend/tooltip
	export { providerColor };
</script>

<div bind:this={mapEl} class="w-full h-full" />

<style>
	:global(.ookla-popup .leaflet-popup-content-wrapper) {
		background: #1f2937;
		color: #f3f4f6;
		border: 1px solid #374151;
		border-radius: 8px;
		font-size: 13px;
	}
	:global(.ookla-popup .leaflet-popup-tip) { background: #1f2937; }
	:global(.leaflet-control-zoom a) {
		background: #1f2937 !important;
		color: #9ca3af !important;
		border-color: #374151 !important;
	}
	:global(.leaflet-control-zoom a:hover) {
		background: #374151 !important;
		color: #f3f4f6 !important;
	}
	:global(.leaflet-control-attribution) {
		background: rgba(17,24,39,0.8) !important;
		color: #6b7280 !important;
		font-size: 10px;
	}
	:global(.leaflet-control-attribution a) { color: #9ca3af !important; }
</style>
