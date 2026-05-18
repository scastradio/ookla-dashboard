<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

	export let points: { area: string; lat: number; lng: number; value: number; count: number }[] = [];
	export let metricLabel = 'Download';
	export let metricUnit = 'Mbps';
	export let colorFn: (t: number) => string = () => '#6366f1';
	export let maxVal = 1;
	export let minVal = 0;

	const dispatch = createEventDispatcher<{ hover: { area: string; value: number; count: number; x: number; y: number } | null }>();

	let mapEl: HTMLDivElement;
	let L: typeof import('leaflet');
	let map: import('leaflet').Map;
	let circleLayer: import('leaflet').LayerGroup;

	// South Africa bounds
	const SA_CENTER: [number, number] = [-29.0, 25.0];
	const SA_BOUNDS = [[-35.0, 16.0], [-22.0, 33.5]] as [[number, number], [number, number]];

	function radiusForValue(val: number, max: number): number {
		if (max <= 0) return 6;
		return 4 + (val / max) * 28;
	}

	function hexToRgba(hex: string, alpha: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r},${g},${b},${alpha})`;
	}

	function colorForValue(val: number): string {
		const t = maxVal > minVal ? (val - minVal) / (maxVal - minVal) : 0;
		return colorFn(Math.max(0, Math.min(1, t)));
	}

	onMount(async () => {
		L = (await import('leaflet')).default;
		await import('leaflet/dist/leaflet.css');

		map = L.map(mapEl, {
			center: SA_CENTER,
			zoom: 6,
			minZoom: 5,
			maxZoom: 12,
			maxBounds: SA_BOUNDS,
			maxBoundsViscosity: 0.85,
			zoomControl: true,
		});

		// Dark tile layer (CartoDB Dark Matter)
		L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
			subdomains: 'abcd',
			maxZoom: 19,
		}).addTo(map);

		circleLayer = L.layerGroup().addTo(map);
		renderCircles();
	});

	onDestroy(() => {
		map?.remove();
	});

	function renderCircles() {
		if (!L || !circleLayer) return;
		circleLayer.clearLayers();

		for (const pt of points) {
			if (!pt.lat || !pt.lng) continue;
			const color = colorForValue(pt.value);
			const radius = radiusForValue(pt.value, maxVal);

			const circle = L.circleMarker([pt.lat, pt.lng], {
				radius,
				fillColor: color,
				fillOpacity: 0.75,
				color: color,
				weight: 1,
				opacity: 0.9,
			});

			circle.on('mouseover', (e) => {
				circle.setStyle({ fillOpacity: 1, weight: 2 });
				dispatch('hover', {
					area: pt.area,
					value: pt.value,
					count: pt.count,
					x: e.originalEvent.clientX,
					y: e.originalEvent.clientY,
				});
			});
			circle.on('mousemove', (e) => {
				dispatch('hover', {
					area: pt.area,
					value: pt.value,
					count: pt.count,
					x: e.originalEvent.clientX,
					y: e.originalEvent.clientY,
				});
			});
			circle.on('mouseout', () => {
				circle.setStyle({ fillOpacity: 0.75, weight: 1 });
				dispatch('hover', null);
			});

			circle.bindPopup(
				`<strong>${pt.area}</strong><br/>${metricLabel}: ${pt.value.toFixed(2)} ${metricUnit}<br/>${pt.count.toLocaleString()} tests`,
				{ className: 'ookla-popup' }
			);

			circleLayer.addLayer(circle);
		}
	}

	$: if (circleLayer) { points; maxVal; minVal; renderCircles(); }
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
	:global(.ookla-popup .leaflet-popup-tip) {
		background: #1f2937;
	}
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
	:global(.leaflet-control-attribution a) {
		color: #9ca3af !important;
	}
</style>
