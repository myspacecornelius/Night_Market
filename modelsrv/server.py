from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Any
import numpy as np, os

MODEL_NAME = os.getenv("MODEL_NAME","price_forecaster")
app = FastAPI(title=f"{MODEL_NAME} mock server")

class PredictPayload(BaseModel):
    instances: List[Any]

@app.get(f"/v1/models/{MODEL_NAME}")
def status():
    return {"model_version_status":[{"state":"AVAILABLE","status":{"error_code":"OK"}}]}

@app.post(f"/v1/models/{MODEL_NAME}:predict")
def predict(payload: PredictPayload):
    try:
        x = np.array(payload.instances, dtype=float)   # [N, F]
        w = np.arange(x.shape[1], dtype=float) + 1.0   # simple deterministic weights
        y = (x @ w).reshape(-1,1).tolist()
        return {"predictions": y}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
