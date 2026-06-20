from pydantic import BaseModel, Field
from typing import List, Optional, Literal

# --- Geography Models ---
class Coordinates(BaseModel):
    lat: float
    lng: float

class GeoPolygon(BaseModel):
    points: List[Coordinates]

# --- Entities ---
class DisasterZone(BaseModel):
    id: str
    polygon: GeoPolygon
    rainfall_intensity: float = Field(..., description="Rainfall in mm/hr", ge=0.0)
    wind_speed: float = Field(..., description="Wind speed in km/h", ge=0.0)
    flood_probability: float = Field(..., description="0.0 to 1.0", ge=0.0, le=1.0)
    risk_score: float = Field(..., description="Composite risk from 0.0 to 10.0", ge=0.0, le=10.0)
    population_affected: int

class Hospital(BaseModel):
    id: str
    name: str
    location: Coordinates
    total_doctors: int
    doctors_available: int
    total_beds: int
    beds_available: int
    patients: int
    inventory_level: str = Field(..., description="High, Medium, Critical")

class SafeZone(BaseModel):
    id: str
    location: Coordinates
    total_capacity: int
    current_occupancy: int

class StorageArea(BaseModel):
    id: str
    location: Coordinates
    food_level: str = Field(..., description="High, Medium, Critical")
    water_level: str = Field(..., description="High, Medium, Critical")
    medical_kits: str = Field(..., description="High, Medium, Critical")
    capacity_percent: int

class RescueTeam(BaseModel):
    team_id: str
    location: Coordinates
    capacity_remaining: int
    current_assignment: str = Field(..., description="e.g. Evacuating Sector B")
    contact_callsign: str = "COMMAND-1"
    radio_frequency: str = "UHF-430.100"

class SOSSignal(BaseModel):
    id: str
    location: Coordinates
    priority_score: int = Field(..., description="1-5 urgency")
    assigned_team_id: Optional[str] = None

class TelecomDensity(BaseModel):
    id: str
    location: Coordinates
    last_ping_count: int
    status: str = Field(..., description="Active, Degraded, Offline")

class RoadBlockage(BaseModel):
    id: str
    location: Coordinates
    status: str = Field(..., description="Blocked, Impassable, Flooded")

class CasualtyStats(BaseModel):
    missing: int = 0
    rescued: int = 0
    fatalities: int = 0

# --- Overall Simulation State ---
class SimulationState(BaseModel):
    timestamp_iso: str
    disaster_zones: List[DisasterZone]
    hospitals: List[Hospital]
    safe_zones: List[SafeZone]
    storage_areas: List[StorageArea]
    rescue_teams: List[RescueTeam]
    sos_signals: List[SOSSignal]
    telecom_clusters: List[TelecomDensity]
    road_blockages: List[RoadBlockage] = []
    casualties: CasualtyStats = Field(default_factory=CasualtyStats)

# --- Gemini Structured Output Models ---
class ResourceGap(BaseModel):
    entity_id: str
    gap_type: Literal["Doctors", "Beds", "Inventory", "Rescue_Capacity", "Food", "Water"]
    severity: Literal["Low", "Medium", "High", "Critical"]

class Recommendation(BaseModel):
    action_item: str
    target_entity_id: str
    justification: str
    severity: Literal["Low", "Medium", "High", "Critical"] = "Medium"

class AIReasoning(BaseModel):
    risk_assessment: List[str]
    resource_gap_analysis: List[ResourceGap]
    predictions: List[str]
    recommended_actions: List[Recommendation]
    confidence_score: int = Field(..., ge=0, le=100)
    explanation: str
