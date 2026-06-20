// Global Simulation State
let currentRainfallIntensity = 0;

// Initialize Leaflet Map
// Initialize Leaflet Map Layers
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });

const map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    layers: [darkLayer]
}).setView([11.554, 76.136], 12); // Default to Wayanad Landslide Area

// Add Base Map Toggle Control
const baseMaps = {
    "Tactical Dark Mode": darkLayer,
    "Real-Time Satellite": satelliteLayer,
    "Standard Street Map": osmLayer
};
L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);

// Setup Map Panes for strict Z-Index visual hierarchy
map.createPane('pane_disaster'); map.getPane('pane_disaster').style.zIndex = 400;
map.createPane('pane_telecom'); map.getPane('pane_telecom').style.zIndex = 410;
map.createPane('pane_safezone'); map.getPane('pane_safezone').style.zIndex = 420;
map.createPane('pane_storage'); map.getPane('pane_storage').style.zIndex = 430;
map.createPane('pane_hospital'); map.getPane('pane_hospital').style.zIndex = 440;
map.createPane('pane_teams'); map.getPane('pane_teams').style.zIndex = 450;
map.createPane('pane_sos'); map.getPane('pane_sos').style.zIndex = 460;
map.createPane('pane_blockage'); map.getPane('pane_blockage').style.zIndex = 470;

// DOM Elements
const infoPanel = document.getElementById('infoPanel');
const panelTitle = document.getElementById('panelTitle');
const panelContent = document.getElementById('panelContent');
const timeSinceUpdate = document.getElementById('timeSinceUpdate');

// Close panel when clicking map
map.on('click', () => {
    closePanel();
});

// Panel management
window.closePanel = () => {
    infoPanel.classList.add('hide');
    if (window.activeTelecomCircle) {
        map.removeLayer(window.activeTelecomCircle);
        window.activeTelecomCircle = null;
    }
};

function openPanel(title, contentHTML) {
    panelTitle.innerHTML = title;
    panelContent.innerHTML = contentHTML;
    infoPanel.classList.remove('hide');
}

// Live Indicator State
let lastUpdateTime = new Date();
setInterval(() => {
    let diffSq = Math.floor((new Date() - lastUpdateTime) / 1000);
    let min = String(Math.floor(diffSq / 60)).padStart(2, '0');
    let sec = String(diffSq % 60).padStart(2, '0');
    timeSinceUpdate.innerText = `${min}:${sec}`;
}, 1000);

// WebSocket Connection
let ws;
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket Connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Update received:', data);
        if (data.type === 'broadcast_dispatched') {
            showToast('Broadcast Dispatched: ' + data.message);
        } else {
            lastUpdateTime = new Date();
            renderData(data);
        }
    };
}

// Layer Groups
let zonesLayer = L.featureGroup().addTo(map);
let safeZonesLayer = L.featureGroup().addTo(map);
let storageLayer = L.featureGroup().addTo(map);
let hospitalsLayer = L.featureGroup().addTo(map);
let teamsLayer = L.featureGroup().addTo(map);
let telecomLayer = L.featureGroup().addTo(map);
let sosLayer = L.featureGroup().addTo(map);
let blockageLayer = L.featureGroup().addTo(map);
let rescueLinesLayer = L.featureGroup().addTo(map);

// Layer Visibility State
const layerVisibility = {
    zones: true,
    safe_zones: true,
    storage: true,
    hospitals: true,
    teams: true,
    telecom: true,
    sos: true,
    blockages: true
};

function updateMapLayer(layer, key, allowedByZoom) {
    if (layerVisibility[key] && allowedByZoom) {
        if (!map.hasLayer(layer)) {
            map.addLayer(layer);
        }
    } else {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }
}

function syncLayers() {
    const zoom = map.getZoom();
    
    // Always visible regardless of zoom
    updateMapLayer(zonesLayer, 'zones', true);
    
    // Med zoom and above
    const medZoom = zoom >= 10;
    updateMapLayer(telecomLayer, 'telecom', medZoom);
    updateMapLayer(safeZonesLayer, 'safe_zones', medZoom);
    updateMapLayer(storageLayer, 'storage', medZoom);
    
    // Close zoom and above
    const closeZoom = zoom >= 11;
    updateMapLayer(hospitalsLayer, 'hospitals', closeZoom);
    updateMapLayer(teamsLayer, 'teams', closeZoom);
    updateMapLayer(sosLayer, 'sos', closeZoom);
    updateMapLayer(blockageLayer, 'blockages', closeZoom);
    updateMapLayer(rescueLinesLayer, 'sos', closeZoom);
}

// Define simple SVG Icons for Leaflet Markers
const createIcon = (className, htmlContent) => L.divIcon({
    className: `custom-marker ${className}`,
    html: htmlContent,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

function renderData(data) {
    const { state, ai, paused, tick_count, scenario, events_log } = data;
    if (!state) return;
    
    window.lastSimState = state;
    if (window.executeAutoPilotActions) {
        window.executeAutoPilotActions();
    }

    // Update scrubber controls
    if (tick_count !== undefined) {
        document.getElementById('currentTick').innerText = tick_count;
        document.getElementById('timelineScrubber').value = tick_count;
    }
    
    // Update Casualty Stats
    if (state.casualties) {
        document.getElementById('statMissing').innerText = state.casualties.missing;
        document.getElementById('statRescued').innerText = state.casualties.rescued;
        document.getElementById('statFatalities').innerText = state.casualties.fatalities;
    }
    
    if (paused !== undefined) {
        isSimulationPaused = paused;
        document.getElementById('timelinePlayBtn').innerText = isSimulationPaused ? '▶' : '⏸';
    }
    if (scenario !== undefined && scenario !== currentScenario) {
        currentScenario = scenario;
        document.getElementById('scenarioSelector').value = scenario;
        renderMilestones(scenario);
        
        const contextTitle = document.getElementById('contextTitle');
        const contextDesc = document.getElementById('contextDesc');
        if (scenario === 'chennai') {
            map.setView([12.980, 80.220], 12);
            if(contextTitle) contextTitle.innerText = "2015 Chennai Floods";
            if(contextDesc) contextDesc.innerText = "Tamil Nadu, India. Heavy inundation.";
        } else {
            map.setView([11.554, 76.136], 12);
            if(contextTitle) contextTitle.innerText = "2024 Wayanad Landslide";
            if(contextDesc) contextDesc.innerText = "Kerala, India. Real coordinates.";
        }
    }

    // Update Operations Log Feed
    if (events_log !== undefined) {
        const logBody = document.getElementById('opsLogBody');
        if (logBody) {
            if (events_log.length === 0) {
                logBody.innerHTML = `<div style="color: var(--text-secondary)">[SYSTEM] Telemetry grid online. Waiting for scenario updates...</div>`;
            } else {
                logBody.innerHTML = events_log.map(evt => {
                    let color = '#38bdf8'; // light blue default
                    if (evt.includes('[DECISION]')) {
                        color = '#10b981'; // Green for administrative decisions
                    } else if (evt.includes('[ADMIN ALERT]') || evt.includes('Critical') || evt.includes('Landslide') || evt.includes('triage') || evt.includes('fail') || evt.includes('Offline')) {
                        color = 'var(--accent-red)';
                    } else if (evt.includes('Torrential') || evt.includes('Heavy') || evt.includes('downpour')) {
                        color = 'var(--accent-amber)';
                    } else if (evt.includes('established') || evt.includes('Routine') || evt.includes('Active') || evt.includes('Complete')) {
                        color = 'var(--accent-green)';
                    }
                    return `<div style="margin-bottom: 4px; color: ${color}">${evt}</div>`;
                }).join('');
                // Auto-scroll to bottom
                logBody.scrollTop = logBody.scrollHeight;
            }
        }
    }

    // Update Rain intensity tracker
    if (state.disaster_zones && state.disaster_zones.length > 0) {
        currentRainfallIntensity = state.disaster_zones[0].rainfall_intensity || 0;
    } else {
        currentRainfallIntensity = 0;
    }

    // Fast mapping of AI analysis for easy lookup
    const resourceGaps = ai.resource_gap_analysis || [];
    const getGap = (entityId) => resourceGaps.find(g => g.entity_id === entityId);

    const recs = ai.recommended_actions || [];
    const getRec = (entityId) => recs.find(r => r.target_entity_id === entityId);

    // 1. Disaster Zones — Single organic glowing polygon with centroid pulse
    zonesLayer.clearLayers();
    state.disaster_zones.forEach(zone => {
        let isHighRisk = ai.risk_assessment.some(r => r.toLowerCase().includes('zone') || r.includes(zone.id));
        let coreCoords = zone.polygon.points.map(p => [p.lat, p.lng]);

        let corePoly = L.polygon(coreCoords, {
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.35,
            weight: 2,
            className: `disaster-glow ${isHighRisk ? 'ai-pulse-overload' : ''}`,
            pane: 'pane_disaster'
        });

        corePoly.on('click', () => {
            let info = `
                Risk Score: <strong>${zone.risk_score.toFixed(1)}/10</strong><br>
                Rainfall: ${zone.rainfall_intensity.toFixed(1)} mm/h<br>
                Population Affected: <strong>${zone.population_affected}</strong><br>
                <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;">
                <em>AI Analysis:</em> ${isHighRisk ? '<span style="color:var(--accent-red)">Elevated threat detected.</span>' : 'Monitoring stable.'}<br><br>
                <button class="sim-btn" style="background:var(--accent-red); margin-top:8px; text-align:center; border:none;" onclick="sendBroadcast('${zone.id}')">Send Emergency Broadcast</button>
            `;
            openPanel('Danger Zone', info);
        });
        corePoly.addTo(zonesLayer);

        // Centroid Epicenter Beacon
        const centLat = coreCoords.reduce((s, c) => s + c[0], 0) / coreCoords.length;
        const centLng = coreCoords.reduce((s, c) => s + c[1], 0) / coreCoords.length;
        
        // Draw 5 km Epicenter Vicinity Circle
        let epicenterCircle = L.circle([centLat, centLng], {
            radius: 5000, // 5 km
            color: 'var(--accent-amber)',
            fillColor: 'transparent',
            weight: 1.2,
            dashArray: '4, 8',
            pane: 'pane_disaster'
        });
        epicenterCircle.bindTooltip("5 km Epicenter Buffer Area", {
            permanent: false,
            direction: 'center',
            className: 'leaflet-tooltip-dark'
        });
        epicenterCircle.addTo(zonesLayer);

        let pulseCircle = L.circleMarker([centLat, centLng], {
            radius: isHighRisk ? 9 : 6,
            color: '#fff',
            weight: 1.5,
            fillColor: '#ef4444',
            fillOpacity: 0.9,
            className: 'ai-pulse-overload'
        });
        pulseCircle.bindTooltip(isHighRisk ? '⚠ EPICENTER — HIGH RISK' : '⚠ EPICENTER', {
            permanent: false,
            direction: 'top',
            className: 'leaflet-tooltip-dark'
        });
        pulseCircle.addTo(zonesLayer);
    });

    // Reusable SVG strings
    const svgHospital = `<svg viewBox="0 0 24 24" fill="#e2e8f0" stroke="#0f1115" stroke-width="1.5"><path d="M12 2v20M2 12h20M12 2A10 10 0 0 1 22 12 10 10 0 0 1 12 22 10 10 0 0 1 2 12 10 10 0 0 1 12 2z"/></svg>`;
    const svgSafeZone = `<svg viewBox="0 0 24 24" fill="#10b981" stroke="#0f1115" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const svgStorage = `<svg viewBox="0 0 24 24" fill="#3b82f6" stroke="#0f1115" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>`;
    const svgTelecom = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM12 12v.01M12 7v3.5M8 12a4 4 0 0 1 8 0"/></svg>`;
    const svgRescue = `<svg viewBox="0 0 24 24" fill="#f59e0b" stroke="#0f1115" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.54.51l.77-.74zM12.83 8.3L3.77 17.36a6 6 0 1 0 8.48 8.48l9.06-9.06m-8.48-8.48l8.48 8.48"/></svg>`;

    // 2. Hospitals
    hospitalsLayer.clearLayers();
    if (state.hospitals) {
        state.hospitals.forEach(h => {
            let gap = getGap(h.id);
            let isOverloaded = h.beds_available < 20;
            let indicator = gap ? `<div class="indicator-red"></div>` : '';
            let ringClass = gap ? 'ai-pulse-overload' : '';
            let overloadClass = isOverloaded ? 'hospital-overflow' : '';

            // Calculate distance to closest disaster zone center
            let isCloseToEpicenter = false;
            let minDistance = null;
            if (state.disaster_zones) {
                state.disaster_zones.forEach(z => {
                    // Estimate center of polygon
                    let points = z.polygon.points;
                    let centLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
                    let centLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
                    
                    let d = map.distance([h.location.lat, h.location.lng], [centLat, centLng]);
                    if (minDistance === null || d < minDistance) {
                        minDistance = d;
                    }
                    if (d <= 5000) {
                        isCloseToEpicenter = true;
                    }
                });
            }

            let epicenterBadge = '';
            if (isCloseToEpicenter) {
                epicenterBadge = `<div style="position:absolute; top:-6px; right:-6px; background:#f59e0b; color:#fff; border-radius:50%; width:14px; height:14px; font-size:9px; display:flex; align-items:center; justify-content:center; font-weight:bold; border:1px solid #111; box-shadow:0 0 6px #f59e0b;">⚠</div>`;
            }

            let markerHtml = `<div style="width:28px;height:28px;position:relative;" class="${ringClass} ${overloadClass}">${svgHospital}${indicator}${epicenterBadge}</div>`;
            let marker = L.marker([h.location.lat, h.location.lng], {
                icon: createIcon('marker-icon', markerHtml),
                pane: 'pane_hospital'
            });

            let tooltipText = `${h.name}`;
            if (minDistance !== null) {
                tooltipText += `<br>Epicenter Dist: ${(minDistance/1000).toFixed(1)} km ${isCloseToEpicenter ? '⚠️' : ''}`;
            }
            marker.bindTooltip(tooltipText, {
                direction: 'top',
                className: 'leaflet-tooltip-dark'
            });

            marker.on('click', () => {
                let distDetail = minDistance !== null 
                    ? `<br>Epicenter Distance: <strong style="color:${isCloseToEpicenter ? 'var(--accent-amber)' : '#fff'}">${(minDistance/1000).toFixed(2)} km</strong> ${isCloseToEpicenter ? '<span style="color:var(--accent-amber); font-weight:bold;">[CRITICAL 5KM VICINITY]</span>' : ''}`
                    : '';
                let info = `
                    Total Beds: <strong>${h.total_beds}</strong><br>
                    Available Beds: <strong style="color:${h.beds_available < 50 ? 'var(--accent-red)' : '#fff'}">${h.beds_available}</strong><br>
                    Available Doctors: <strong>${h.doctors_available}</strong><br>
                    Supply Inventory: <strong>${h.inventory_level}</strong>
                    ${distDetail}
                    <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;">
                    <em>AI Gap Report:</em> ${gap ? `<span style="color:var(--accent-red)">${gap.gap_type} Gap (${gap.severity})</span>` : 'Adequate resources.'}
                `;
                openPanel(h.name, info);
            });
            hospitalsLayer.addLayer(marker);
        });
    }

    // 3. Safe Zones
    safeZonesLayer.clearLayers();
    if (state.safe_zones) {
        state.safe_zones.forEach(sz => {
            let pct = Math.round((sz.current_occupancy / sz.total_capacity) * 100);
            let clr = pct > 80 ? 'var(--accent-amber)' : '#fff';

            let markerHtml = `<div style="width:26px;height:26px;">${svgSafeZone}</div>`;
            let marker = L.marker([sz.location.lat, sz.location.lng], {
                icon: createIcon('marker-icon', markerHtml),
                pane: 'pane_safezone'
            });

            marker.on('click', () => {
                let info = `
                    Max Shelter Capacity: <strong>${sz.total_capacity}</strong><br>
                    Current Occupancy: <strong style="color:${clr}">${sz.current_occupancy}</strong> (${pct}%)
                `;
                openPanel('Govt Relief Camp', info);
            });
            safeZonesLayer.addLayer(marker);
        });
    }

    // 4. Storage Areas
    storageLayer.clearLayers();
    if (state.storage_areas) {
        state.storage_areas.forEach(s => {
            let markerHtml = `<div style="width:26px;height:26px;">${svgStorage}</div>`;
            let marker = L.marker([s.location.lat, s.location.lng], {
                icon: createIcon('marker-icon', markerHtml),
                pane: 'pane_storage'
            });

            marker.on('click', () => {
                let info = `
                    Hub Storage Utilization: <strong>${s.capacity_percent}%</strong><br>
                    Rations Level: <strong style="color:${s.food_level === 'Low' ? 'var(--accent-red)' : '#fff'}">${s.food_level}</strong><br>
                    Water Level: <strong style="color:${s.water_level === 'Low' ? 'var(--accent-red)' : '#fff'}">${s.water_level}</strong><br>
                    First Aid Kits: <strong style="color:${s.medical_kits === 'Low' ? 'var(--accent-red)' : '#fff'}">${s.medical_kits}</strong><br>
                    <div style="margin-top: 12px;">
                        <button onclick="restockStorage('${s.id}')" style="width: 100%; background: var(--accent-green); color: #000; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">🚚 DISPATCH RELIEF TRUCKS</button>
                    </div>
                `;
                openPanel('Forward Logistics Depot', info);
            });
            storageLayer.addLayer(marker);
        });
    }

    // 5. Rescue Teams
    teamsLayer.clearLayers();
    if (state.rescue_teams) {
        state.rescue_teams.forEach(t => {
            let gap = getGap(t.team_id);
            let rec = getRec(t.team_id);
            let indicator = rec ? `<div class="indicator-amber"></div>` : '';
            let pulseClass = rec ? 'ai-pulse-overload' : '';

            let markerHtml = `<div style="width:26px;height:26px;position:relative;" class="${pulseClass}">${svgRescue}${indicator}</div>`;
            let marker = L.marker([t.location.lat, t.location.lng], {
                icon: createIcon('team-marker', markerHtml),
                pane: 'pane_teams'
            });

            marker.on('click', () => {
                let info = `
                    Callsign: <strong>${t.contact_callsign || 'N/A'}</strong><br>
                    Comm Frequency: <strong>${t.radio_frequency || 'N/A'}</strong><br>
                    Operational Capacity: <strong>${t.capacity_remaining}%</strong><br>
                    Deployment Assignment: <strong>${t.current_assignment}</strong><br>
                    <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;">
                    ${gap ? `<span style="color:var(--accent-red)">Gap: ${gap.gap_type} (${gap.severity})</span><br>` : ''}
                    ${rec ? `<em>AI Reassign: ${rec.action_item}</em>` : ''}
                `;
                openPanel(`Rescue Team: ${t.contact_callsign || t.team_id}`, info);
            });
            teamsLayer.addLayer(marker);
        });
    }

    // 6. SOS Signals
    sosLayer.clearLayers();
    rescueLinesLayer.clearLayers();
    if (state.sos_signals) {
        state.sos_signals.forEach(sos => {
            let isUrgent = sos.priority_score >= 4;
            let size = 10 + (sos.priority_score * 2.5); // Scales dynamically based on priority
            let isAssigned = !!sos.assigned_team_id;

            // Check if SOS is within any Offline telecom tower's coverage range (3000 meters)
            let isSatelliteSOS = false;
            if (state.telecom_clusters) {
                state.telecom_clusters.forEach(tel => {
                    if (tel.status === 'Offline') {
                        let d = map.distance([sos.location.lat, sos.location.lng], [tel.location.lat, tel.location.lng]);
                        if (d <= 3000) {
                            isSatelliteSOS = true;
                        }
                    }
                });
            }

            // Draw polyline if assigned to a team
            if (isAssigned && state.rescue_teams) {
                let team = state.rescue_teams.find(t => t.team_id === sos.assigned_team_id);
                if (team) {
                    let line = L.polyline(
                        [[sos.location.lat, sos.location.lng], [team.location.lat, team.location.lng]],
                        {
                            color: '#10b981',
                            weight: 2.5,
                            dashArray: '5, 8',
                            pane: 'pane_sos'
                        }
                    );
                    
                    let distanceMeters = map.distance(
                        [sos.location.lat, sos.location.lng], 
                        [team.location.lat, team.location.lng]
                    );
                    let assumedSpeedMetersPerTick = 120; // assumed movement speed
                    let etaTicks = Math.max(1, Math.ceil(distanceMeters / assumedSpeedMetersPerTick));
                    let etaMins = Math.max(5, Math.ceil(etaTicks * 3.5)); // Arbitrary map to minutes
                    
                    line.bindTooltip(
                        `<div style="text-align: center;"><b>DISPATCH ROUTE</b><br>ETA: ~${etaMins} mins (${etaTicks} Ticks)<br>Dist: ${(distanceMeters/1000).toFixed(2)} km</div>`, 
                        { permanent: false, className: 'leaflet-tooltip-dark' }
                    );

                    rescueLinesLayer.addLayer(line);
                }
            }

            let color = isAssigned ? '#10b981' : (isSatelliteSOS ? '#22d3ee' : (isUrgent ? '#ef4444' : '#f59e0b'));
            let labelText = isAssigned ? 'Acknowledged (Dispatched)' : (isSatelliteSOS ? 'Satellite SOS (Offline Telecom)' : 'Cellular Mobile Beacon');
            let borderStyle = isAssigned ? 'border:2px dashed #fff;' : 'border:2px solid #fff;';
            let dotHtml = `
            <div style="width:${size}px; height:${size}px; background: ${color}; border-radius:50%; ${borderStyle} box-shadow: 0 2px 4px rgba(0,0,0,0.5); position: relative;" class="${isUrgent || isSatelliteSOS || isAssigned ? 'ai-pulse-overload' : ''}">
            </div>`;

            let marker = L.marker([sos.location.lat, sos.location.lng], {
                icon: createIcon('marker-icon', dotHtml),
                pane: 'pane_sos'
            });

            marker.bindTooltip(`${labelText} (Priority ${sos.priority_score})`, {
                direction: 'top',
                className: 'leaflet-tooltip-dark'
            });

            marker.on('click', () => {
                let teamOptions = '';
                let availableCount = 0;
                if (state.rescue_teams) {
                    state.rescue_teams.forEach(t => {
                        let isBusy = t.current_assignment.startsWith('Rescue');
                        if (!isBusy) {
                            teamOptions += `<option value="${t.team_id}">${t.contact_callsign}</option>`;
                            availableCount++;
                        }
                    });
                }
                if (availableCount === 0) {
                    teamOptions = `<option value="">-- No Teams Available --</option>`;
                }
                
                let dispatchForm = '';
                if (isAssigned) {
                    let assignedTeam = state.rescue_teams ? state.rescue_teams.find(t => t.team_id === sos.assigned_team_id) : null;
                    let assignedCallsign = assignedTeam ? assignedTeam.contact_callsign : sos.assigned_team_id;
                    dispatchForm = `
                        <div style="margin-top: 12px; padding: 10px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 4px; font-size: 11px;">
                            ✅ Dispatched: <strong>${assignedCallsign}</strong>
                        </div>
                    `;
                } else {
                    dispatchForm = `
                        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                            <label style="font-size: 11px; color: var(--text-secondary);">Assign Rescue Fleet:</label>
                            <div style="display: flex; gap: 8px;">
                                <select id="assign-team-select" style="flex: 1; background: #222; border: 1px solid #444; color: #fff; padding: 4px; border-radius: 4px; font-size: 11px;">
                                    <option value="">-- Select Team --</option>
                                    ${teamOptions}
                                </select>
                                <button onclick="dispatchRescueTeam('${sos.id}')" style="background: var(--accent-blue); color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">DISPATCH</button>
                            </div>
                        </div>
                    `;
                }

                let info = `
                    Priority Level: <strong>${sos.priority_score} / 5</strong><br>
                    Coordinates: <strong>${sos.location.lat.toFixed(4)}, ${sos.location.lng.toFixed(4)}</strong><br>
                    Signal Source: <strong>${isSatelliteSOS ? 'Satellite SOS (Offline Cell)' : 'Cellular Mobile Beacon'}</strong>
                    ${dispatchForm}
                `;
                openPanel(`SOS Distress Signal: ${sos.id}`, info);
            });
            sosLayer.addLayer(marker);
        });
    }

    // 7. Telecom Density
    telecomLayer.clearLayers();
    if (state.telecom_clusters) {
        state.telecom_clusters.forEach(tel => {
            let clr = tel.status === 'Active' ? '#3b82f6' : (tel.status === 'Degraded' ? '#f59e0b' : '#ef4444');
            let dotHtml = `<div style="width:28px;height:28px;color:${clr}; background:#111; border-radius:50%; border:2px solid ${clr}; padding:2px; opacity:0.6;">${svgTelecom}</div>`;

            let marker = L.marker([tel.location.lat, tel.location.lng], {
                icon: createIcon('marker-icon', dotHtml),
                pane: 'pane_telecom'
            });

            // Always show range circle faintly
            let rangeCircle = L.circle([tel.location.lat, tel.location.lng], {
                color: clr,
                fillColor: clr,
                fillOpacity: 0.05,
                radius: 3000,
                dashArray: '5, 10',
                weight: 1.5,
                pane: 'pane_telecom'
            });

            // Vision Feature: Draw blackout trapped zone estimation if tower is Offline
            if (tel.status === 'Offline') {
                let popEst = tel.last_ping_count;
                let dangerZone = L.circle([tel.location.lat, tel.location.lng], {
                    color: '#f97316',
                    fillColor: '#f97316',
                    fillOpacity: 0.15,
                    radius: 2000, // area where cell coverage is dead
                    weight: 2,
                    dashArray: '4, 6',
                    className: 'ai-pulse-overload',
                    pane: 'pane_telecom'
                });
                
                dangerZone.bindTooltip(`<b>BLACKOUT ZONE: Trapped Est.</b><br>👥 ~${popEst} individuals offline`, {
                    permanent: false,
                    direction: 'top',
                    className: 'leaflet-tooltip-dark'
                });
                telecomLayer.addLayer(dangerZone);
            }

            marker.on('click', () => {
                let info = `
                    Last Signal Count (Active Users): <strong>${tel.last_ping_count}</strong><br>
                    Network Status: <strong style="color:${clr}">${tel.status}</strong>
                `;
                openPanel('Telecom Cluster', info);
            });
            telecomLayer.addLayer(marker);
            telecomLayer.addLayer(rangeCircle);
        });
    }

    // 8. Road Blockages
    blockageLayer.clearLayers();
    if (state.road_blockages) {
        state.road_blockages.forEach(b => {
            let markerHtml = `<div style="font-size: 16px; text-shadow: 0 0 4px #000; cursor: pointer;">❌</div>`;
            let marker = L.marker([b.location.lat, b.location.lng], {
                icon: createIcon('marker-icon', markerHtml),
                pane: 'pane_blockage'
            });

            marker.bindTooltip(`ROAD BLOCKED<br><span style="color:#f87171">${b.status}</span>`, {
                direction: 'top',
                className: 'leaflet-tooltip-dark'
            });
            blockageLayer.addLayer(marker);
        });
    }

    // Update Dashboard Metrics Tab
    updateDashboardMetrics(state, ai);

    // Update Tactical AI Tab
    document.getElementById('aiConfidenceBadge').innerText = `${ai.confidence_score}% Conf`;
    document.getElementById('aiExplanationText').innerText = ai.explanation || 'Stable.';

    // Risk List
    const riskContainer = document.getElementById('aiRiskList');
    riskContainer.innerHTML = ai.risk_assessment && ai.risk_assessment.length > 0
        ? ai.risk_assessment.map(r => `<div>${r}</div>`).join('')
        : '<div>Telemetry indicates standard operational parameters.</div>';

    // Gaps List
    const gapsContainer = document.getElementById('aiGapsList');
    gapsContainer.innerHTML = resourceGaps.length > 0
        ? resourceGaps.map(g => `<span class="ai-gap-badge gap-severity-${g.severity}">${g.gap_type}: ${g.severity}</span>`).join('')
        : '<div style="font-size:12px; color:var(--text-secondary);">No critical resource deficits found.</div>';

    // Predictions List
    const predContainer = document.getElementById('aiPredictionsList');
    predContainer.innerHTML = ai.predictions && ai.predictions.length > 0
        ? ai.predictions.map(p => `<div>${p}</div>`).join('')
        : '<div>No imminent escalations predicted.</div>';

    // Recommended Actions List
    const actionsContainer = document.getElementById('aiActionsList');
    const severityWeight = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
    const sortedRecs = [...recs].sort((a, b) => (severityWeight[b.severity || "Medium"] || 2) - (severityWeight[a.severity || "Medium"] || 2));

    actionsContainer.innerHTML = sortedRecs.length > 0
        ? sortedRecs.map(a => {
            const sev = a.severity || "Medium";
            const sevClass = `gap-severity-${sev}`;
            return `
            <div class="ai-action-card" style="position: relative;">
                <span class="ai-gap-badge ${sevClass}" style="position: absolute; top: 12px; right: 12px; margin: 0; font-size: 9px; padding: 2px 6px;">${sev}</span>
                <div class="ai-action-title" style="padding-right: 70px;">${a.action_item}</div>
                <div style="font-size:11px; margin-top: 4px;">Target: <strong>${a.target_entity_id.toUpperCase().replace('_', ' ')}</strong></div>
                <div class="ai-action-justification">${a.justification}</div>
            </div>
            `;
        }).join('')
        : '<div style="font-size:12px; color:var(--text-secondary);">All systems stable. No tactical maneuvers required.</div>';

    // Sync layers visibility
    syncLayers();
}

// Map Zoom Logic
map.on('zoomend', () => {
    syncLayers();
});

// Layer toggle helper
window.toggleLayer = (type) => {
    if (type === 'all') {
        for (let k in layerVisibility) {
            layerVisibility[k] = true;
            const btn = document.getElementById(`toggle-${k}`);
            if (btn) btn.classList.add('active');
        }
        syncLayers();
        showToast('All overlays active and synced.');
        return;
    }
    
    if (layerVisibility.hasOwnProperty(type)) {
        layerVisibility[type] = !layerVisibility[type];
        const btn = document.getElementById(`toggle-${type}`);
        if (btn) {
            if (layerVisibility[type]) {
                btn.classList.add('active');
                showToast(`${type.replace('_', ' ')} layer enabled.`);
            } else {
                btn.classList.remove('active');
                showToast(`${type.replace('_', ' ')} layer disabled.`);
            }
        }
        syncLayers();
    }
};

// Simulation Trigger
window.triggerSimulation = (type) => {
    console.log(`Triggering Simulation: ${type}`);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'trigger_sim', type: type }));
    }
};

window.sendBroadcast = (zoneId) => {
    closePanel();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'emergency_broadcast', target_id: zoneId }));
    }
    showToast('Requesting AI Evacuation Plan...');
};

// Simple Toast Notification
function showToast(msg) {
    let toast = document.createElement('div');
    toast.style.position = 'absolute';
    toast.style.top = '80px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(13, 17, 23, 0.95)';
    toast.style.border = '1px solid var(--accent-blue)';
    toast.style.color = '#fff';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '2000';
    toast.style.boxShadow = '0 0 15px rgba(14, 165, 233, 0.3)';
    toast.style.backdropFilter = 'blur(20px)';
    toast.style.fontSize = '11.5px';
    toast.style.fontWeight = '700';
    toast.style.textTransform = 'uppercase';
    toast.style.letterSpacing = '0.5px';
    toast.innerText = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// Unified Right Sidebar Tab Switching
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.getElementById(`tab-btn-${tabId}`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
    if (tabId === 'audit') {
        updateAuditLogUI();
    }
};

// Playback and Scrubber Controls
let isSimulationPaused = false;
let currentScenario = 'wayanad';

const milestones = {
    wayanad: [
        { t: 1, label: 'Start' },
        { t: 5, label: 'Rain Surge' },
        { t: 10, label: 'Outage' },
        { t: 15, label: 'Landslide' },
        { t: 35, label: 'Stabilize' }
    ],
    chennai: [
        { t: 1, label: 'Start' },
        { t: 5, label: 'Rain Surge' },
        { t: 10, label: 'Outage' },
        { t: 15, label: 'Velachery Flood' },
        { t: 35, label: 'Boats Deployed' }
    ]
};

function renderMilestones(scenarioKey) {
    const container = document.getElementById('timelineMilestones');
    if (!container) return;
    container.innerHTML = '';
    const scenarioMilestones = milestones[scenarioKey] || [];
    scenarioMilestones.forEach(m => {
        const pct = ((m.t - 1) / 38) * 100;
        const label = document.createElement('span');
        label.className = 'milestone-label';
        label.style.left = `${pct}%`;
        label.innerText = `T=${m.t}: ${m.label}`;
        label.onclick = () => {
            scrubTimelineCommit(m.t);
        };
        container.appendChild(label);
    });

    const phasesContainer = document.getElementById('timelinePhases');
    if (phasesContainer) {
        phasesContainer.innerHTML = '';
        const phases = [
            { name: 'PRE-ALERT', start: 1, end: 4, color: 'rgba(56, 189, 248, 0.12)' },
            { name: 'ESCALATION', start: 5, end: 9, color: 'rgba(251, 191, 36, 0.12)' },
            { name: 'BLACKOUT', start: 10, end: 14, color: 'rgba(168, 85, 247, 0.15)' },
            { name: 'DISASTER', start: 15, end: 25, color: 'rgba(244, 63, 94, 0.15)' },
            { name: 'RESPONSE', start: 26, end: 35, color: 'rgba(16, 185, 129, 0.12)' },
            { name: 'STABILIZATION', start: 36, end: 39, color: 'rgba(56, 189, 248, 0.08)' }
        ];
        
        phases.forEach(p => {
            const widthPct = ((p.end - p.start + 1) / 39) * 100;
            const block = document.createElement('div');
            block.className = 'phase-block';
            block.style.width = `${widthPct}%`;
            block.style.backgroundColor = p.color;
            block.innerText = p.name;
            phasesContainer.appendChild(block);
        });
    }
}

window.changeScenario = (val) => {
    console.log('Changing scenario to', val);
    currentScenario = val;
    renderMilestones(val);
    
    const contextTitle = document.getElementById('contextTitle');
    const contextDesc = document.getElementById('contextDesc');

    if (val === 'chennai') {
        map.setView([12.980, 80.220], 12);
        if(contextTitle) contextTitle.innerText = "2015 Chennai Floods";
        if(contextDesc) contextDesc.innerText = "Tamil Nadu, India. Heavy inundation.";
    } else {
        map.setView([11.554, 76.136], 12);
        if(contextTitle) contextTitle.innerText = "2024 Wayanad Landslide";
        if(contextDesc) contextDesc.innerText = "Kerala, India. Real coordinates.";
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'change_scenario', scenario: val }));
    }
    showToast(`Loading ${val === 'chennai' ? 'Chennai Flood' : 'Wayanad Landslide'} Scenario...`);
};

window.toggleTimelinePlay = () => {
    isSimulationPaused = !isSimulationPaused;
    document.getElementById('timelinePlayBtn').innerText = isSimulationPaused ? '▶' : '⏸';
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'toggle_play', paused: isSimulationPaused }));
    }
    showToast(isSimulationPaused ? 'Simulation paused.' : 'Simulation resumed.');
};

window.scrubTimeline = (val) => {
    document.getElementById('currentTick').innerText = val;
};

window.scrubTimelineCommit = (val) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'jump_to_tick', tick: parseInt(val) }));
    }
    showToast(`Jumping to tick ${val}...`);
};

function updateDashboardMetrics(state, ai) {
    const getLevelColor = (level) => {
        if (level === 'High') return '#10b981';
        if (level === 'Medium') return '#fbbf24';
        return '#ef4444';
    };

    // 1. Hospitals
    const hospContainer = document.getElementById('hospitalsMetrics');
    if (hospContainer && state.hospitals) {
        hospContainer.innerHTML = state.hospitals.map(h => {
            const occPct = (h.patients / h.total_beds) * 100;
            let barColor = 'bg-green';
            if (occPct > 90) barColor = 'bg-red';
            else if (occPct > 70) barColor = 'bg-amber';
            
            return `
                <div class="metric-card">
                    <div class="metric-card-title">
                        <span>${h.name}</span>
                        <span class="gap-severity-${h.inventory_level}" style="font-size: 10px; padding: 2px 6px; border-radius: 4px;">${h.inventory_level}</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-secondary);">
                        Beds Occupied: <strong>${h.patients}/${h.total_beds}</strong> (${occPct.toFixed(0)}%)<br>
                        Doctors Active: <strong>${h.doctors_available}/${h.total_doctors}</strong>
                    </div>
                    <div class="metric-bar-container">
                        <div class="metric-bar-fill ${barColor}" style="width: ${occPct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Rescue Fleet
    const rescueContainer = document.getElementById('rescueMetrics');
    if (rescueContainer && state.rescue_teams) {
        rescueContainer.innerHTML = state.rescue_teams.map(r => {
            let statusColor = 'bg-blue';
            if (r.current_assignment === 'Rescuing') statusColor = 'bg-red';
            else if (r.current_assignment === 'Patrol') statusColor = 'bg-amber';
            
            return `
                <div class="metric-card">
                    <div class="metric-card-title">
                        <span>Team ${r.team_id.toUpperCase()}</span>
                        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; color:#fff;" class="${statusColor}">${r.current_assignment}</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-secondary);">
                        Capacity Remaining: <strong>${r.capacity_remaining}%</strong>
                    </div>
                    <div class="metric-bar-container">
                        <div class="metric-bar-fill bg-green" style="width: ${r.capacity_remaining}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3. Storage & Supplies
    const storageContainer = document.getElementById('storageMetrics');
    if (storageContainer && state.storage_areas) {
        storageContainer.innerHTML = state.storage_areas.map(s => {
            return `
                <div class="metric-card">
                    <div class="metric-card-title">
                        <span>${s.id.toUpperCase().replace('_', ' ')}</span>
                        <span style="font-size: 11px;">Cap: ${s.capacity_percent}%</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-secondary); display:flex; gap:8px; margin-bottom: 4px;">
                        <span>🍞 Food: <strong style="color:${getLevelColor(s.food_level)}">${s.food_level}</strong></span>
                        <span>💧 Water: <strong style="color:${getLevelColor(s.water_level)}">${s.water_level}</strong></span>
                        <span>⚕️ Meds: <strong style="color:${getLevelColor(s.medical_kits)}">${s.medical_kits}</strong></span>
                    </div>
                    <div class="metric-bar-container">
                        <div class="metric-bar-fill bg-blue" style="width: ${s.capacity_percent}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Start
renderMilestones('wayanad');
connectWebSocket();

// --- Canvas Environmental Rain Particle System ---
const rainCanvas = document.getElementById('rainCanvas');
const rainCtx = rainCanvas.getContext('2d');

let rainParticles = [];
const maxRainParticles = 250;

function resizeRainCanvas() {
    const rect = document.getElementById('map').getBoundingClientRect();
    rainCanvas.width = rect.width;
    rainCanvas.height = rect.height;
}

window.addEventListener('resize', resizeRainCanvas);
// Run initial resize
resizeRainCanvas();

class RainParticle {
    constructor() {
        this.reset();
        this.y = Math.random() * rainCanvas.height;
    }
    
    reset() {
        this.x = Math.random() * rainCanvas.width;
        this.y = -15;
        this.length = 8 + Math.random() * 12;
        this.speed = 10 + Math.random() * 8;
        this.opacity = 0.08 + Math.random() * 0.22;
    }
    
    update() {
        this.y += this.speed;
        this.x += (this.speed * 0.08); // Slight wind drift
        if (this.y > rainCanvas.height) {
            this.reset();
        }
    }
    
    draw() {
        rainCtx.beginPath();
        rainCtx.strokeStyle = `rgba(156, 163, 175, ${this.opacity})`;
        rainCtx.lineWidth = 1.0;
        rainCtx.moveTo(this.x, this.y);
        rainCtx.lineTo(this.x + (this.length * 0.08), this.y + this.length);
        rainCtx.stroke();
    }
}

// Populate initial rain particles
for (let i = 0; i < maxRainParticles; i++) {
    rainParticles.push(new RainParticle());
}

function animateRain() {
    rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
    
    // Scale active particle count based on rain intensity (max in simulation is 380 mm/h)
    // 0 mm/h -> 0 particles
    // 80 mm/h -> ~50 particles
    // 380 mm/h -> 250 particles
    const activeCount = Math.min(
        maxRainParticles, 
        Math.floor((currentRainfallIntensity / 380) * maxRainParticles)
    );
    
    if (activeCount > 0) {
        for (let i = 0; i < activeCount; i++) {
            rainParticles[i].update();
            rainParticles[i].draw();
        }
    }
    
    requestAnimationFrame(animateRain);
}

// Start animation loop
animateRain();

window.toggleLegend = () => {
    const content = document.getElementById('legendContent');
    const icon = document.getElementById('legendToggleIcon');
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.innerText = '▼';
    } else {
        content.style.display = 'none';
        icon.innerText = '▶';
    }
};

// --- Decision Audit Log Utility functions ---
window.dispatchRescueTeam = (sosId) => {
    const select = document.getElementById('assign-team-select');
    if (!select || !select.value) {
        showToast('Please select a rescue team first.');
        return;
    }
    const teamId = select.value;
    const teamCallsign = select.options[select.selectedIndex].text;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            action: 'assign_rescue',
            sos_id: sosId,
            team_id: teamId
        }));
        
        logDecision(`Dispatched [${teamCallsign}] to SOS Signal [${sosId}]`);
        showToast(`Dispatch sent: ${teamCallsign} assigned to SOS ${sosId}`);
        closePanel();
    } else {
        showToast('WebSocket connection unavailable. Unable to dispatch.');
    }
};

function logDecision(actionText) {
    let logs = JSON.parse(localStorage.getItem('baryonic_audit_logs') || '[]');
    const tstamp = new Date().toLocaleTimeString();
    logs.push(`[${tstamp}] ${actionText}`);
    if (logs.length > 50) logs.shift();
    localStorage.setItem('baryonic_audit_logs', JSON.stringify(logs));
    updateAuditLogUI();
}

window.clearAuditLog = () => {
    localStorage.removeItem('baryonic_audit_logs');
    updateAuditLogUI();
    showToast('Decision log cleared.');
};

window.restockStorage = (storageId) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            action: 'restock_storage',
            storage_id: storageId
        }));
        logDecision(`Dispatched supply trucks to restock Logistics Hub [${storageId.toUpperCase()}]`);
        showToast(`🚚 Relief supplies dispatched to Hub ${storageId.toUpperCase()}`);
        closePanel();
    } else {
        showToast('WebSocket connection unavailable.');
    }
};

function updateAuditLogUI() {
    const container = document.getElementById('auditLogContent');
    if (!container) return;
    
    let logs = JSON.parse(localStorage.getItem('baryonic_audit_logs') || '[]');
    if (logs.length === 0) {
        container.innerHTML = `<div style="color: var(--text-secondary)">No decisions logged yet in this session.</div>`;
    } else {
        container.innerHTML = logs.map(log => `
            <div style="padding: 6px 8px; background: rgba(255,255,255,0.03); border-left: 2px solid var(--accent-blue); border-radius: 0 4px 4px 0; line-height: 1.3;">
                ${log}
            </div>
        `).reverse().join('');
    }
}

// Initial UI load
updateAuditLogUI();

window.handleCommsInput = (event) => {
    if (event.key === 'Enter') {
        const input = document.getElementById('opsLogInput');
        const text = input.value.trim();
        if (text) {
            logDecision(`[COMMS BROADCAST] Admin: "${text}"`);
            showToast('Secure broadcast transmitted to field units.');
            input.value = '';
        }
    }
};

let isAutoPilotEnabled = false;
window.toggleAutoPilot = () => {
    isAutoPilotEnabled = !isAutoPilotEnabled;
    const btn = document.getElementById('autoPilotBtn');
    if (isAutoPilotEnabled) {
        btn.innerText = '🤖 AUTO-PILOT ENGAGED';
        btn.classList.add('auto-pilot-active');
        showToast('AI Auto-Pilot Engaged: Automatic execution of critical directives.');
        executeAutoPilotActions();
    } else {
        btn.innerText = '🤖 ENABLE AI AUTO-PILOT';
        btn.classList.remove('auto-pilot-active');
        showToast('AI Auto-Pilot Disengaged. Resuming manual control.');
    }
};

window.executeAutoPilotActions = () => {
    if (!isAutoPilotEnabled) return;
    
    // Scan for critical logistics issues to auto-restock
    if (window.lastSimState && window.lastSimState.storage_areas) {
        window.lastSimState.storage_areas.forEach(storage => {
            if (storage.capacity_percent < 50) {
                // Auto-trigger restock
                window.restockStorage(storage.id);
            }
        });
    }
};
