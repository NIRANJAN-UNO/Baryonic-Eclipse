from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import asyncio
import os

from simulation import DisasterSimulation
from ai_engine import analyze_disaster_state, generate_evacuation_broadcast

app = FastAPI(title="Disaster Command Dashboard")

# Mount frontend files
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

active_connections = []
sim = DisasterSimulation()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    # Send immediate initial state
    initial_ai = await analyze_disaster_state(sim.state)
    await websocket.send_json({
        "state": sim.state.model_dump(),
        "ai": initial_ai.model_dump(),
        "paused": sim.paused,
        "tick_count": sim.tick_count,
        "scenario": sim.scenario,
        "events_log": sim.events_log
    })
    
    try:
        while True:
            # Listen for simulation commands from the frontend
            data = await websocket.receive_json()
            
            if data.get("action") == "trigger_sim":
                sim_type = data.get("type")
                if sim_type == "rainfall":
                    for z in sim.state.disaster_zones:
                        z.rainfall_intensity += 50.0  # Spike rainfall
                elif sim_type == "hospital_close":
                    if sim.state.hospitals:
                        sim.state.hospitals[0].beds_available = 0
                        sim.state.hospitals[0].inventory_level = "Critical"
                elif sim_type == "rescue_reduce":
                    if sim.state.rescue_teams:
                        sim.state.rescue_teams[0].capacity_remaining = 0
                
                # Immediately force a tick and broadcast
                sim.tick()
                await broadcast_simulation(sim.state)

            elif data.get("action") == "change_scenario":
                scenario = data.get("scenario")
                print(f"MAIN: Changing scenario to {scenario}")
                sim.change_scenario(scenario)
                await broadcast_simulation(sim.state)

            elif data.get("action") == "jump_to_tick":
                tick = int(data.get("tick"))
                print(f"MAIN: Jumping simulation to tick {tick}")
                sim.jump_to_tick(tick)
                await broadcast_simulation(sim.state)

            elif data.get("action") == "toggle_play":
                paused = bool(data.get("paused"))
                print(f"MAIN: Toggling simulation play/pause. Paused = {paused}")
                sim.paused = paused
                if not sim.paused:
                    sim.tick()
                await broadcast_simulation(sim.state)

            elif data.get("action") == "emergency_broadcast":
                zone_id = data.get("target_id")
                # find zone
                zone_data = next((z for z in sim.state.disaster_zones if z.id == zone_id), None)
                if zone_data:
                    message = await generate_evacuation_broadcast(zone_data.model_dump())
                    await websocket.send_json({
                        "type": "broadcast_dispatched",
                        "message": message,
                        "zone_id": zone_id
                    })

            elif data.get("action") == "assign_rescue":
                sos_id = data.get("sos_id")
                team_id = data.get("team_id")
                sos_sig = next((s for s in sim.state.sos_signals if s.id == sos_id), None)
                team = next((r for r in sim.state.rescue_teams if r.team_id == team_id), None)
                if sos_sig and team:
                    sos_sig.assigned_team_id = team_id
                    team.current_assignment = f"Rescue (SOS {sos_id})"
                    sim.log_event(f"[DECISION] {team.contact_callsign} dispatched to SOS Beacon {sos_id} ({sos_sig.location.lat:.4f}, {sos_sig.location.lng:.4f})")
                    await broadcast_simulation(sim.state)

            elif data.get("action") == "restock_storage":
                storage_id = data.get("storage_id")
                storage = next((s for s in sim.state.storage_areas if s.id == storage_id), None)
                if storage:
                    storage.food_level = "High"
                    storage.water_level = "High"
                    storage.medical_kits = "High"
                    storage.capacity_percent = 95
                    sim.log_event(f"[DECISION] Admin dispatched relief supply trucks to restock Logistics Hub {storage_id.upper()}")
                    await broadcast_simulation(sim.state)

            elif data.get("action") == "comms_broadcast":
                msg = data.get("message", "")
                sim.log_event(f"[COMMS BROADCAST] Admin: '{msg}'")
                await broadcast_simulation(sim.state)

    except WebSocketDisconnect:
        active_connections.remove(websocket)

async def broadcast_simulation(state):
    # Ask Gemini for new analysis
    ai_output = await analyze_disaster_state(state)
    payload = {
        "state": state.model_dump(),
        "ai": ai_output.model_dump(),
        "paused": sim.paused,
        "tick_count": sim.tick_count,
        "scenario": sim.scenario,
        "events_log": sim.events_log
    }
    # Broadcast
    for connection in active_connections:
        try:
            await connection.send_json(payload)
        except:
            pass

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(sim.run_loop(tick_seconds=30, callback=broadcast_simulation))

app.mount("/", StaticFiles(directory=frontend_dir), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
