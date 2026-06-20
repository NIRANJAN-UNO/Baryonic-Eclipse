import asyncio
from datetime import datetime, timezone
import random
from models import (
    SimulationState, DisasterZone, Hospital, SafeZone, 
    RescueTeam, SOSSignal, Coordinates, GeoPolygon,
    StorageArea, TelecomDensity, RoadBlockage, CasualtyStats
)

class DisasterSimulation:
    def __init__(self, scenario: str = "wayanad"):
        self.scenario = scenario
        self.paused = False
        self.tick_count = 0
        self.events_log = []
        self.state = self._generate_initial_state()

    def log_event(self, msg: str):
        from datetime import datetime
        tstamp = datetime.now().strftime("%H:%M:%S")
        print(f"SIMULATION: {tstamp} T={self.tick_count}: {msg}")
        # Keep log limited to last 30 events to avoid memory bloat
        self.events_log.append(f"[{tstamp}] [T={self.tick_count}] {msg}")
        if len(self.events_log) > 30:
            self.events_log.pop(0)

    def change_scenario(self, scenario: str):
        self.scenario = scenario
        self.state = self._generate_initial_state()
        self.tick_count = 0
        self.events_log = []

    def jump_to_tick(self, target_tick: int):
        self.state = self._generate_initial_state()
        self.tick_count = 0
        self.events_log = []
        
        for _ in range(target_tick):
            self.tick()

    def _generate_initial_state(self) -> SimulationState:
        if self.scenario == "chennai":
            return self._generate_chennai_state()
        return self._generate_wayanad_state()

    def _generate_wayanad_state(self) -> SimulationState:
        # Wayanad Landslide Scenario (July 2024)
        zone = DisasterZone(
            id="zone_wayanad_landslides",
            polygon=GeoPolygon(points=[
                Coordinates(lat=11.560, lng=76.120),  # West shoulder
                Coordinates(lat=11.568, lng=76.128),  # NW ridge
                Coordinates(lat=11.575, lng=76.148),  # North peak
                Coordinates(lat=11.572, lng=76.165),  # NE slope
                Coordinates(lat=11.558, lng=76.172),  # Eastern flank
                Coordinates(lat=11.543, lng=76.168),  # SE valley
                Coordinates(lat=11.535, lng=76.158),  # South base
                Coordinates(lat=11.532, lng=76.142),  # SW base
                Coordinates(lat=11.538, lng=76.128),  # Western approach
            ]),
            rainfall_intensity=120.5, # Starts moderate, will surge
            wind_speed=25.0,
            flood_probability=0.20,
            risk_score=3.5,
            population_affected=20000
        )

        hospitals = [
            Hospital(
                id="hosp_0",
                name="WIMS Hospital (Dr. Moopen's)", # Real hospital nearby
                location=Coordinates(lat=11.574, lng=76.118),
                total_doctors=120,
                doctors_available=100,
                total_beds=800,
                beds_available=300, # Stable start
                patients=500,
                inventory_level="High"
            ),
            Hospital(
                id="hosp_1",
                name="District Hospital, Mananthavady",
                location=Coordinates(lat=11.802, lng=76.002),
                total_doctors=80,
                doctors_available=60,
                total_beds=500,
                beds_available=200,
                patients=300,
                inventory_level="High"
            ),
            Hospital(
                id="hosp_2",
                name="Taluk Hospital, Vythiri",
                location=Coordinates(lat=11.552, lng=76.035),
                total_doctors=40,
                doctors_available=35,
                total_beds=150,
                beds_available=40,
                patients=110,
                inventory_level="Medium"
            )
        ]

        safe_zones = [
            SafeZone(
                id="sz_0",
                location=Coordinates(lat=11.564, lng=76.132), # Meppadi Govt HSS Relief Camp
                total_capacity=2500,
                current_occupancy=50 # Empty at start
            ),
            SafeZone(
                id="sz_1",
                location=Coordinates(lat=11.605, lng=76.083), # Kalpetta Base Camp
                total_capacity=5000,
                current_occupancy=100
            )
        ]

        storage_areas = [
            StorageArea(
                id="store_0",
                location=Coordinates(lat=11.605, lng=76.083), # Kalpetta Central Hub
                food_level="High",
                water_level="High",
                medical_kits="High",
                capacity_percent=85
            ),
            StorageArea(
                id="store_1",
                location=Coordinates(lat=11.554, lng=76.136), # Meppadi Forward Base
                food_level="High",
                water_level="High",
                medical_kits="High",
                capacity_percent=90
            )
        ]

        rescue_teams = [
            RescueTeam(
                team_id="ndrf_1",
                location=Coordinates(lat=11.450, lng=76.050), # Staging outside
                capacity_remaining=50,
                current_assignment="Standby",
                contact_callsign="NDRF TEAM 1",
                radio_frequency="VHF-148.550 MHz"
            ),
            RescueTeam(
                team_id="army_eng",
                location=Coordinates(lat=11.480, lng=75.950), # Staging outside
                capacity_remaining=100,
                current_assignment="Standby",
                contact_callsign="ARMY ENG COY 4",
                radio_frequency="HF-8.450 MHz"
            ),
            RescueTeam(
                team_id="fire_force_wayanad",
                location=Coordinates(lat=11.554, lng=76.136), # Meppadi base
                capacity_remaining=20,
                current_assignment="Patrol",
                contact_callsign="WAYANAD FIRE UNIT 2",
                radio_frequency="VHF-165.200 MHz"
            )
        ]

        sos_signals = [] # Nobody calling yet
            
        telecoms = [
            TelecomDensity(
                id="tel_bsnl_meppadi",
                location=Coordinates(lat=11.554, lng=76.136),
                last_ping_count=4500,
                status="Active"
            ),
            TelecomDensity(
                id="tel_jio_chooralmala",
                location=Coordinates(lat=11.536, lng=76.155),
                last_ping_count=3200,
                status="Active"
            ),
            TelecomDensity(
                id="tel_airtel_mundakkai",
                location=Coordinates(lat=11.528, lng=76.170),
                last_ping_count=1800,
                status="Active"
            )
        ]

        road_blockages = [
            RoadBlockage(id="rb_nh766", location=Coordinates(lat=11.545, lng=76.130), status="Blocked")
        ]

        return SimulationState(
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            disaster_zones=[zone],
            hospitals=hospitals,
            safe_zones=safe_zones,
            storage_areas=storage_areas,
            rescue_teams=rescue_teams,
            sos_signals=sos_signals,
            telecom_clusters=telecoms,
            road_blockages=road_blockages,
            casualties=CasualtyStats(missing=0, rescued=0, fatalities=0)
        )

    def _generate_chennai_state(self) -> SimulationState:
        # Chennai Flood Scenario
        zone = DisasterZone(
            id="zone_chennai_floods",
            polygon=GeoPolygon(points=[
                Coordinates(lat=13.012, lng=80.200),  # NW Marina side
                Coordinates(lat=13.018, lng=80.215),  # North - Trade Centre
                Coordinates(lat=13.015, lng=80.235),  # NE
                Coordinates(lat=13.005, lng=80.250),  # East coast
                Coordinates(lat=12.988, lng=80.258),  # Besant Nagar flank
                Coordinates(lat=12.970, lng=80.255),  # SE Adyar
                Coordinates(lat=12.955, lng=80.240),  # South Adyar
                Coordinates(lat=12.952, lng=80.222),  # Velachery core
                Coordinates(lat=12.958, lng=80.205),  # SW
                Coordinates(lat=12.972, lng=80.198),  # Western boundary
                Coordinates(lat=12.992, lng=80.200),  # West
            ]),
            rainfall_intensity=80.0, # Starts moderate, will surge
            wind_speed=35.0,
            flood_probability=0.30,
            risk_score=4.0,
            population_affected=75000
        )

        hospitals = [
            Hospital(
                id="hosp_0",
                name="Government Hospital, Guindy",
                location=Coordinates(lat=13.011, lng=80.213),
                total_doctors=150,
                doctors_available=120,
                total_beds=1000,
                beds_available=450,
                patients=550,
                inventory_level="High"
            ),
            Hospital(
                id="hosp_1",
                name="Royapettah Government Hospital",
                location=Coordinates(lat=13.056, lng=80.264),
                total_doctors=90,
                doctors_available=75,
                total_beds=300,
                beds_available=120,
                patients=180,
                inventory_level="High"
            )
        ]

        safe_zones = [
            SafeZone(
                id="sz_0",
                location=Coordinates(lat=13.018, lng=80.205), # Chennai Trade Centre Camp
                total_capacity=5000,
                current_occupancy=200
            ),
            SafeZone(
                id="sz_1",
                location=Coordinates(lat=12.979, lng=80.222), # Velachery Camp
                total_capacity=3000,
                current_occupancy=150
            )
        ]

        storage_areas = [
            StorageArea(
                id="store_0",
                location=Coordinates(lat=13.018, lng=80.205), # Central Hub
                food_level="High",
                water_level="High",
                medical_kits="High",
                capacity_percent=90
            ),
            StorageArea(
                id="store_1",
                location=Coordinates(lat=12.910, lng=80.225), # Southern Hub (Shifted)
                food_level="High",
                water_level="High",
                medical_kits="High",
                capacity_percent=85
            )
        ]

        rescue_teams = [
            RescueTeam(
                team_id="ndrf_1",
                location=Coordinates(lat=13.006, lng=80.221), # Guindy Staging Base
                capacity_remaining=80,
                current_assignment="Standby",
                contact_callsign="NDRF COY 5",
                radio_frequency="VHF-149.250 MHz"
            ),
            RescueTeam(
                team_id="navy_1",
                location=Coordinates(lat=12.923, lng=80.125), # Tambaram Air Station Staging
                capacity_remaining=120,
                current_assignment="Standby",
                contact_callsign="INS ADYAR RESCUE",
                radio_frequency="UHF-325.500 MHz"
            )
        ]

        sos_signals = []
            
        telecoms = [
            TelecomDensity(
                id="tel_jio_velachery",
                location=Coordinates(lat=12.979, lng=80.222),
                last_ping_count=12000,
                status="Active"
            ),
            TelecomDensity(
                id="tel_bsnl_tambaram",
                location=Coordinates(lat=12.929, lng=80.115), # Shifted
                last_ping_count=9500,
                status="Active"
            )
        ]

        road_blockages = [
            RoadBlockage(id="rb_velachery_main", location=Coordinates(lat=12.975, lng=80.220), status="Flooded")
        ]

        return SimulationState(
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            disaster_zones=[zone],
            hospitals=hospitals,
            safe_zones=safe_zones,
            storage_areas=storage_areas,
            rescue_teams=rescue_teams,
            sos_signals=sos_signals,
            telecom_clusters=telecoms,
            road_blockages=road_blockages,
            casualties=CasualtyStats(missing=0, rescued=0, fatalities=0)
        )

    async def run_loop(self, tick_seconds: int = 10, callback=None):
        while True:
            if not self.paused:
                self.tick()
                if callback:
                    await callback(self.state)
            await asyncio.sleep(tick_seconds)

    def tick(self):
        self.tick_count += 1
        t = self.tick_count

        if self.scenario == "chennai":
            self._tick_chennai(t)
        else:
            self._tick_wayanad(t)

        # Background constant flux for visuals
        for tel in self.state.telecom_clusters:
            if tel.status != "Offline":
                tel.last_ping_count = max(0, tel.last_ping_count + random.randint(-50, 50))
                
        # Fade out older SOS signals over time to simulate response
        if len(self.state.sos_signals) > 0 and random.random() > 0.7:
             self.state.sos_signals.pop(0)

        self.state.timestamp_iso = datetime.now(timezone.utc).isoformat()

    def _tick_wayanad(self, t: int):
        zone = self.state.disaster_zones[0]
        wims = next(h for h in self.state.hospitals if h.id == "hosp_0")
        taluk = next(h for h in self.state.hospitals if h.id == "hosp_2")
        sz_meppadi = next(s for s in self.state.safe_zones if s.id == "sz_0")
        ndrf = next(r for r in self.state.rescue_teams if r.team_id == "ndrf_1")
        army = next(r for r in self.state.rescue_teams if r.team_id == "army_eng")
        tel_choor = next(t for t in self.state.telecom_clusters if t.id == "tel_jio_chooralmala")
        tel_mund = next(t for t in self.state.telecom_clusters if t.id == "tel_airtel_mundakkai")

        # Wayanad Playback
        if t == 1:
            self.log_event("Routine telemetry streaming. Telecom Active. Rescue Patrol.")

        elif t == 5:
            # TICK 5: Heavy rains begin
            self.log_event("Sustained torrential downpour begins.")
            zone.rainfall_intensity = 380.0
            zone.wind_speed = 65.0
            zone.flood_probability = 0.65
            zone.risk_score = 6.0

        elif t == 10:
            # TICK 10: Telecom towers break
            self.log_event("Telecommunication towers fail due to extreme weather.")
            tel_choor.status = "Offline"
            tel_choor.last_ping_count = 0
            tel_mund.status = "Offline"
            tel_mund.last_ping_count = 0

        elif t == 15:
            # TICK 15: Landslide
            self.log_event("Critical Landslide impacts Chooralmala and Mundakkai.")
            zone.flood_probability = 0.95
            zone.risk_score = 10.0
            
            self.log_event("[INTERCEPT] '...water is rising rapidly... need help near the bridge...'")
            
            # Initial SOS burst clustered near hotspots
            hotspots = [(11.528, 76.170), (11.536, 76.155), (11.520, 76.165)]
            for _ in range(8):
                center = random.choice(hotspots)
                lat = center[0] + random.gauss(0, 0.003)
                lng = center[1] + random.gauss(0, 0.003)
                self.state.sos_signals.append(SOSSignal(
                     id=f"sos_{random.randint(100,999)}",
                     location=Coordinates(lat=lat, lng=lng),
                     priority_score=5
                ))
            
            self.state.casualties.missing += random.randint(80, 150)
            
            # Add new road blockage
            self.state.road_blockages.append(
                RoadBlockage(id="rb_mundakkai", location=Coordinates(lat=11.525, lng=76.165), status="Impassable")
            )

            # Dynamically EXPAND the polygon southwards over Mundakkai & Chooralmala
            zone.polygon.points = [
                Coordinates(lat=11.580, lng=76.112),  # NW peak
                Coordinates(lat=11.585, lng=76.135),  # North ridge
                Coordinates(lat=11.578, lng=76.158),  # NE
                Coordinates(lat=11.568, lng=76.180),  # Eastern cliff
                Coordinates(lat=11.552, lng=76.192),  # Far East
                Coordinates(lat=11.535, lng=76.190),  # SE extended
                Coordinates(lat=11.515, lng=76.178),  # South surge (Mundakkai)
                Coordinates(lat=11.510, lng=76.158),  # SW flow
                Coordinates(lat=11.512, lng=76.138),  # Lower SW
                Coordinates(lat=11.520, lng=76.118),  # West debris
                Coordinates(lat=11.535, lng=76.108),  # Western wall
                Coordinates(lat=11.548, lng=76.110),  # NW base
            ]

            # Rescue Status changes FROM Patrol TO Rescuing
            ndrf.current_assignment = "Rescuing"
            army.current_assignment = "Rescuing"
            # Update the local Wayanad fire force too
            next(r for r in self.state.rescue_teams if r.team_id == "fire_force_wayanad").current_assignment = "Rescuing"
            
        elif t >= 18 and t < 30:
            # TICK 18-30: Gradual Hospital/Doctor Decrease After Disaster
            if t % 2 == 0:
                self.log_event("Casualties arriving at triage. Beds and Doctors decreasing.")
                # WIMS filling up and losing available doctors
                intake = random.randint(15, 30)
                wims.patients = min(wims.total_beds, wims.patients + intake)
                wims.beds_available = max(0, wims.total_beds - wims.patients)
                wims.doctors_available = max(10, wims.doctors_available - random.randint(2, 5))
                if wims.beds_available < 100: wims.inventory_level = "Medium"
                if wims.beds_available < 20: 
                    wims.inventory_level = "Critical"
                    self.log_event(f"[ADMIN ALERT] {wims.name} beds at critical capacity ({wims.beds_available} left). Dispatching emergency supplies.")

                # Taluk Vythiri filling up
                taluk.patients = min(taluk.total_beds, taluk.patients + random.randint(5, 15))
                taluk.beds_available = max(0, taluk.total_beds - taluk.patients)
                taluk.doctors_available = max(5, taluk.doctors_available - random.randint(1, 3))
                if taluk.beds_available < 10: 
                    taluk.inventory_level = "Critical"
                    self.log_event(f"[ADMIN ALERT] {taluk.name} Vythiri is overloaded. Requesting medical staff reinforcement.")

                # Relief camp taking refugees
                sz_meppadi.current_occupancy = min(sz_meppadi.total_capacity, sz_meppadi.current_occupancy + random.randint(100, 300))

                # Casualties update
                self.state.casualties.rescued += random.randint(5, 20)
                self.state.casualties.fatalities += random.randint(1, 5)

                # Rescuers moving
                ndrf.location.lat += 0.005
                ndrf.location.lng += 0.005
                army.location.lat += 0.002
                army.location.lng += 0.008

            if t == 20:
                self.log_event("[RESCUE RADIO] NDRF-1 reports contact with survivors near Mundakkai bridge")
            if t == 28:
                self.log_event("[MEDIVAC] Helicopter requesting landing zone at Meppadi Camp")

        elif t == 35:
            self.log_event("Rescue operations established. Stabilizing.")
            ndrf.location = Coordinates(lat=11.528, lng=76.170) # Arrived at Mundakkai
            army.location = Coordinates(lat=11.536, lng=76.155) # Arrived at Chooralmala

        elif t == 39:
            self.log_event("Scenario Complete. Looping simulation automatically.")
            self.state = self._generate_initial_state()
            self.tick_count = 0

    def _tick_chennai(self, t: int):
        zone = self.state.disaster_zones[0]
        ghosp = next(h for h in self.state.hospitals if h.id == "hosp_0")
        fortis = next(h for h in self.state.hospitals if h.id == "hosp_1")
        sz_trade = next(s for s in self.state.safe_zones if s.id == "sz_0")
        ndrf = next(r for r in self.state.rescue_teams if r.team_id == "ndrf_1")
        navy = next(r for r in self.state.rescue_teams if r.team_id == "navy_1")
        tel_jio = next(t for t in self.state.telecom_clusters if t.id == "tel_jio_velachery")

        # Chennai Playback
        if t == 1:
            self.log_event("Routine telemetry streaming. Rainy conditions reported.")

        elif t == 5:
            self.log_event("Torrential rainfall surges. Chembarambakkam gates opened.")
            zone.rainfall_intensity = 310.0
            zone.wind_speed = 55.0
            zone.flood_probability = 0.70
            zone.risk_score = 6.5

        elif t == 10:
            self.log_event("Velachery Central telecom network degraded/offline.")
            tel_jio.status = "Offline"
            tel_jio.last_ping_count = 0

        elif t == 15:
            self.log_event("Low-lying areas inundated. Rescuing initiated in Velachery.")
            zone.flood_probability = 0.98
            zone.risk_score = 9.5
            
            self.log_event("[INTERCEPT] '...trapped on the second floor... water still rising in Velachery...'")
            
            # Initial SOS signals clustered near hotspots
            hotspots = [(12.980, 80.220), (12.975, 80.225), (12.960, 80.210)]
            for _ in range(8):
                center = random.choice(hotspots)
                lat = center[0] + random.gauss(0, 0.005)
                lng = center[1] + random.gauss(0, 0.005)
                self.state.sos_signals.append(SOSSignal(
                     id=f"sos_{random.randint(100,999)}",
                     location=Coordinates(lat=lat, lng=lng),
                     priority_score=5
                ))

            self.state.casualties.missing += random.randint(300, 500)

            # Add road blockages
            self.state.road_blockages.append(
                RoadBlockage(id="rb_adyar_bridge", location=Coordinates(lat=13.010, lng=80.255), status="Impassable")
            )

            # Expand disaster zone over Velachery and southern sectors
            zone.polygon.points = [
                Coordinates(lat=13.025, lng=80.195),  # NW - Nungambakkam side
                Coordinates(lat=13.028, lng=80.215),  # North surge
                Coordinates(lat=13.022, lng=80.240),  # NE inundation
                Coordinates(lat=13.010, lng=80.262),  # Far NE coast
                Coordinates(lat=12.990, lng=80.272),  # East ECR line
                Coordinates(lat=12.968, lng=80.265),  # Sholinganallur side
                Coordinates(lat=12.945, lng=80.252),  # SE Perumbakkam
                Coordinates(lat=12.932, lng=80.232),  # Southern extreme
                Coordinates(lat=12.935, lng=80.210),  # SW low-lying
                Coordinates(lat=12.948, lng=80.195),  # West Tambaram
                Coordinates(lat=12.968, lng=80.190),  # Inner west
                Coordinates(lat=12.992, lng=80.192),  # NW return
            ]

            ndrf.current_assignment = "Rescuing"
            navy.current_assignment = "Rescuing"
            
        elif t >= 18 and t < 30:
            if t % 2 == 0:
                self.log_event("Victims arriving at triage centers. Hospital beds filling up.")
                
                intake = random.randint(25, 45)
                ghosp.patients = min(ghosp.total_beds, ghosp.patients + intake)
                ghosp.beds_available = max(0, ghosp.total_beds - ghosp.patients)
                ghosp.doctors_available = max(20, ghosp.doctors_available - random.randint(2, 6))
                if ghosp.beds_available < 150: ghosp.inventory_level = "Medium"
                if ghosp.beds_available < 30: 
                    ghosp.inventory_level = "Critical"
                    self.log_event(f"[ADMIN ALERT] {ghosp.name} beds are critically low ({ghosp.beds_available} left). Diverting incoming casualties.")

                fortis.patients = min(fortis.total_beds, fortis.patients + random.randint(10, 20))
                fortis.beds_available = max(0, fortis.total_beds - fortis.patients)
                fortis.doctors_available = max(10, fortis.doctors_available - random.randint(1, 4))
                if fortis.beds_available < 20: 
                    fortis.inventory_level = "Critical"
                    self.log_event(f"[ADMIN ALERT] {fortis.name} is overloaded. Deploying mobile emergency treatment tents.")

                sz_trade.current_occupancy = min(sz_trade.total_capacity, sz_trade.current_occupancy + random.randint(200, 450))

                # Casualties update
                self.state.casualties.rescued += random.randint(15, 40)
                self.state.casualties.fatalities += random.randint(0, 3)

                # Move rescue units
                ndrf.location.lat -= 0.002
                ndrf.location.lng += 0.001
                navy.location.lat += 0.004
                navy.location.lng += 0.004

            if t == 22:
                self.log_event("[RESCUE RADIO] NAVY-1 reports boat deployed in Velachery residential area")
            if t == 28:
                self.log_event("[AIRLIFT] Requesting helipad clearance at Trade Centre Camp")

        elif t == 35:
            self.log_event("Flood levels stabilized. Heavy machinery and boat deployments active.")
            ndrf.location = Coordinates(lat=12.979, lng=80.222)
            navy.location = Coordinates(lat=12.990, lng=80.230)

        elif t == 39:
            self.log_event("Scenario Complete. Looping simulation automatically.")
            self.state = self._generate_initial_state()
            self.tick_count = 0
