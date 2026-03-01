from fastapi import FastAPI
from pydantic import BaseModel
import logging

logging.basicConfig(level=logging.INFO)

app = FastAPI()

class Alert(BaseModel):
    lat: float
    lon: float
    timestamp: int

@app.post("/api/alert")
async def alert(a: Alert):
    logging.info(f"Received SOS alert: {a}")
    # placeholder: in real deployment, notify emergency contacts
    return {"status": "ok"}
