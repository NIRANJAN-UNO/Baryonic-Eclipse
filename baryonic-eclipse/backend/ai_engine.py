import os
import asyncio
from google import genai
from google.genai import types
from models import SimulationState, AIReasoning
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Load environment variables from .env file
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path)

# Use the API key from environment variables
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

_consecutive_failures = 0
_skipped_requests_count = 0
COOLDOWN_REQUESTS = 5  # Try to reconnect/retry every 5 ticks

async def analyze_disaster_state(state: SimulationState) -> AIReasoning:
    """
    Sends the current simulation state to Gemini API and expects a highly structured 
    JSON strictly following the AIReasoning Pydantic model.
    """
    global _consecutive_failures, _skipped_requests_count
    
    if _consecutive_failures > 0:
        _skipped_requests_count += 1
        if _skipped_requests_count % COOLDOWN_REQUESTS != 0:
            print(f"Gemini API in cool-down mode. Skipping request (attempt {_skipped_requests_count}/{COOLDOWN_REQUESTS}). Using fallback.")
            return fallback_reasoning(state)
        print("Cool-down over. Retrying Gemini API call...")

    system_instruction = """
    You are the Tactical AI Engine for a National Disaster Command Center.
    Your job is to analyze the incoming telemetry from a synthetic disaster zone, identify critical resource gaps, and provide sharp, command-style recommendations.
    Always prioritize identifying hospital overloads, deploying rescue teams optimally, identifying critical food/water shortages in Storage Areas, and noting areas with degraded Telecom networks.
    Your output must be strict JSON that matches the requested schema. Do not include markdown formatting like ```json in the output.
    """
    
    prompt = f"Current State: {state.model_dump_json(indent=2)}\n\nPlease provide a tactical analysis."
    
    try:
        # We need this to run async. If google-genai does not support async directly in the desired shape, we run it in a thread.
        def fetch_gemini():
            return client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=AIReasoning,
                    temperature=0.2,
                ),
            )
            
        response = await asyncio.wait_for(asyncio.to_thread(fetch_gemini), timeout=15.0)
        
        # Parse the output into our Pydantic model
        ai_output = AIReasoning.model_validate_json(response.text)
        
        # Reset counters on success
        _consecutive_failures = 0
        _skipped_requests_count = 0
        return ai_output
        
    except Exception as e:
        print(f"Gemini API Error: {e}")
        _consecutive_failures += 1
        # Return fallback rule-based reasoning
        return fallback_reasoning(state)

def fallback_reasoning(state: SimulationState) -> AIReasoning:
    from models import ResourceGap, Recommendation
    
    risk_assessment = []
    resource_gaps = []
    recommended_actions = []
    predictions = []
    
    # 1. Analyze Hospitals
    for h in state.hospitals:
        occupancy_rate = ((h.total_beds - h.beds_available) / h.total_beds) * 100 if h.total_beds > 0 else 0
        if h.beds_available < 20:
            resource_gaps.append(ResourceGap(
                entity_id=h.id,
                gap_type="Beds",
                severity="Critical"
            ))
            risk_assessment.append(f"Hospital {h.name} is severely overloaded ({occupancy_rate:.1f}% capacity).")
            recommended_actions.append(Recommendation(
                action_item=f"Redirect incoming non-critical casualties away from {h.name} to secondary clinics.",
                target_entity_id=h.id,
                justification=f"Beds available ({h.beds_available}) are below critical threshold of 20.",
                severity="Critical"
            ))
        elif h.beds_available < 50:
            resource_gaps.append(ResourceGap(
                entity_id=h.id,
                gap_type="Beds",
                severity="High"
            ))
            risk_assessment.append(f"Hospital {h.name} beds are depleting fast.")
            
        if h.doctors_available < 10:
            resource_gaps.append(ResourceGap(
                entity_id=h.id,
                gap_type="Doctors",
                severity="High"
            ))
            recommended_actions.append(Recommendation(
                action_item=f"Deploy volunteer medical staff and doctors to {h.name}.",
                target_entity_id=h.id,
                justification="Available doctors are below safe operating threshold.",
                severity="High"
            ))
            
        if h.inventory_level == "Critical":
            resource_gaps.append(ResourceGap(
                entity_id=h.id,
                gap_type="Inventory",
                severity="Critical"
            ))
            recommended_actions.append(Recommendation(
                action_item=f"Restock emergency medical supplies immediately at {h.name}.",
                target_entity_id=h.id,
                justification="Hospital medicine and supply inventory is critical.",
                severity="Critical"
            ))

    # 2. Analyze Storage Areas
    for s in state.storage_areas:
        if s.food_level == "Critical" or s.water_level == "Critical":
            severity = "Critical" if (s.food_level == "Critical" and s.water_level == "Critical") else "High"
            resource_gaps.append(ResourceGap(
                entity_id=s.id,
                gap_type="Food" if s.food_level == "Critical" else "Water",
                severity=severity
            ))
            recommended_actions.append(Recommendation(
                action_item=f"Airlift food and clean drinking water rations to Storage Area {s.id}.",
                target_entity_id=s.id,
                justification=f"Supplies are critically low. Capacity remaining: {s.capacity_percent}%.",
                severity="High"
            ))

    # 3. Analyze Telecom Outages (Vision Feature: last ping count tells us trapped individuals)
    for tel in state.telecom_clusters:
        if tel.status == "Offline":
            risk_assessment.append(f"CRITICAL OUTAGE: Telecom node {tel.id} is offline. Est. {tel.last_ping_count} users stranded without signal.")
            recommended_actions.append(Recommendation(
                action_item=f"Deploy mobile cell tower / emergency satellite relay to node location ({tel.location.lat:.4f}, {tel.location.lng:.4f}).",
                target_entity_id=tel.id,
                justification=f"Restore communication channel for estimated {tel.last_ping_count} stranded citizens.",
                severity="Critical"
            ))
        elif tel.status == "Degraded":
            risk_assessment.append(f"Network congestion at node {tel.id}. Ping count dropping.")

    # 4. Analyze Road Blockages
    for rb in state.road_blockages:
        risk_assessment.append(f"Access point {rb.id} is {rb.status.upper()} at ({rb.location.lat:.4f}, {rb.location.lng:.4f}).")
        recommended_actions.append(Recommendation(
            action_item=f"Dispatch earth-moving equipment / rescue boats to clear route {rb.id}.",
            target_entity_id=rb.id,
            justification=f"Route is completely blocked ({rb.status}), cutting off evacuation pathways.",
            severity="High"
        ))

    # 5. Analyze SOS signals
    if state.sos_signals:
        risk_assessment.append(f"Active SOS distress signals detected: {len(state.sos_signals)} locations.")
        # Group nearest rescue team
        for i, sos in enumerate(state.sos_signals[:3]): # prioritize first 3
            severity = "Critical" if sos.priority_score >= 4 else "High"
            recommended_actions.append(Recommendation(
                action_item=f"Direct nearest active rescue team to SOS coordinates ({sos.location.lat:.4f}, {sos.location.lng:.4f}).",
                target_entity_id=sos.id,
                justification=f"Priority {sos.priority_score} distress signal requires immediate search and rescue intervention.",
                severity=severity
            ))

    # Generate Heuristic Predictions
    if any(h.beds_available < 20 for h in state.hospitals):
        predictions.append("Casualty processing bottleneck expected at primary medical facilities.")
    if any(tel.status == "Offline" for tel in state.telecom_clusters):
        predictions.append("Coordinated evacuations will be severely hindered in network blackout zones.")
    if len(state.sos_signals) > 5:
        predictions.append("Rescue team backlog increasing. Response times will degrade unless additional units deploy.")
    
    if not risk_assessment:
        risk_assessment.append("All regional telemetry indicators currently stable.")
    if not predictions:
        predictions.append("Conditions expected to remain stable over the next observation window.")

    explanation = (
        f"Tactical Heuristic Analysis complete. Monitored {len(state.hospitals)} hospitals, "
        f"{len(state.rescue_teams)} rescue units, and {len(state.telecom_clusters)} telecom zones. "
        f"Detected {len(state.sos_signals)} active emergency beacons."
    )

    return AIReasoning(
        risk_assessment=risk_assessment,
        resource_gap_analysis=resource_gaps,
        predictions=predictions,
        recommended_actions=recommended_actions,
        confidence_score=95,
        explanation=explanation
    )

async def generate_evacuation_broadcast(zone: dict) -> str:
    """
    Generates a localized emergency broadcast message.
    """
    system_instruction = "You are an automated emergency alert system. Generate a short, calm, and urgent SMS evacuation broadcast (max 150 chars) for the affected disaster zone."
    prompt = f"Zone Stats: {zone}\nProvide only the SMS message content."
    try:
        def fetch_gemini():
            return client.models.generate_content(
                model='gemini-1.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.4,
                ),
            )
        response = await asyncio.to_thread(fetch_gemini)
        return response.text.strip()
    except Exception as e:
        print(f"Broadcast Gen Error: {e}")
        return "URGENT: Evacuate zone immediately following local authorities' instructions. Seek high ground."
