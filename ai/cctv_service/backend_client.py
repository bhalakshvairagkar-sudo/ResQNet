"""
ResQNet CCTV Backend Client Module
Provides secure, authenticated transmission of structured optical accident events
and camera health metrics to the central Node.js backend.
"""

import time
import requests
from typing import Dict, Any, Optional, List
from config import CCTVConfig

class BackendClient:
    def __init__(self, backend_url: Optional[str] = None, auth_token: Optional[str] = None):
        raw_url = (backend_url or CCTVConfig.BACKEND_URL).strip().rstrip('/')
        if raw_url.endswith('/api'):
            raw_url = raw_url[:-4].rstrip('/')
        self.backend_url = raw_url
        self.auth_token = auth_token or CCTVConfig.CCTV_AUTH_TOKEN
        self.headers = {
            "Content-Type": "application/json",
            "x-cctv-auth-token": self.auth_token,
            "User-Agent": "ResQNet-YOLO-CCTV-Service/1.0"
        }
        self.event_queue: List[Dict[str, Any]] = []
        self.last_submission_times: Dict[str, float] = {}

    def register_camera(self, camera_data: Dict[str, Any]) -> bool:
        """Registers a camera with the backend on service startup"""
        try:
            url = f"{self.backend_url}/api/cctv/register"
            res = requests.post(url, json=camera_data, headers=self.headers, timeout=4)
            if res.status_code in [200, 201]:
                print(f"[Backend Client] ✅ Registered camera {camera_data.get('camera_id')}")
                return True
            else:
                print(f"[Backend Client] ⚠️ Camera registration warning ({res.status_code}): {res.text}")
                return False
        except Exception as e:
            print(f"[Backend Client] ❌ Failed to register camera {camera_data.get('camera_id')}: {e}")
            return False

    def send_health_heartbeat(self, health_data: Dict[str, Any]) -> bool:
        """Transmits camera health and inference FPS metrics to the backend"""
        try:
            url = f"{self.backend_url}/api/cctv/health"
            res = requests.post(url, json=health_data, headers=self.headers, timeout=3)
            return res.status_code == 200
        except Exception as e:
            return False

    def submit_accident_event(
        self,
        camera_id: str,
        confidence: float,
        evidence: Dict[str, Any],
        latitude: float,
        longitude: float,
        road: str,
        tracks: List[Dict[str, Any]],
        is_demo: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Transmits a verified optical accident event to the central ResQNet backend.
        Implements a cooldown timer to prevent redundant duplicate event flooding.
        """
        curr_time = time.time()
        last_time = self.last_submission_times.get(camera_id, 0.0)

        # Rate-limiting / cooldown check for same camera
        if curr_time - last_time < CCTVConfig.SUBMIT_INTERVAL_SEC:
            return None

        incident_id = f"RNQ-CCTV-{int(curr_time * 1000) % 1000000:06d}"
        iso_timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(curr_time))

        payload = {
            "id": incident_id,
            "incidentId": incident_id,
            "source": "cctv",
            "sourceType": "cctv",
            "cameraId": camera_id,
            "eventType": "ACCIDENT",
            "title": f"CCTV Intersection Collision Alert ({camera_id} - {road})",
            "latitude": latitude,
            "longitude": longitude,
            "locationQuality": "FRESH_GPS",
            "gpsAccuracy": 1.5,
            "confidence": confidence,
            "confidenceScore": round(confidence * 100) if confidence <= 1.0 else round(confidence),
            "severity": 82, # Initial AI optical baseline severity
            "status": "DETECTED",
            "patients": max(1, len(evidence.get("involved_track_ids", [1]))),
            "isDemo": is_demo,
            "timestamp": iso_timestamp,
            "evidence": evidence,
            "tracks": tracks[:5] # Include top 5 tracked objects
        }

        try:
            url = f"{self.backend_url}/api/cctv/events"
            res = requests.post(url, json=payload, headers=self.headers, timeout=5)
            
            if res.status_code in [200, 201]:
                self.last_submission_times[camera_id] = curr_time
                print(f"[Backend Client] 🚨 Successfully reported optical crash on {camera_id} (ID: {incident_id}, Confidence: {payload['confidenceScore']}%) -> HTTP {res.status_code}")
                return res.json()
            else:
                print(f"[Backend Client] ⚠️ Backend returned HTTP {res.status_code}: {res.text}")
                self.event_queue.append(payload)
                return None
        except Exception as e:
            print(f"[Backend Client] ❌ Network error sending accident event: {e}. Queued for retry.")
            self.event_queue.append(payload)
            return None

    def flush_retry_queue(self):
        """Retries sending queued events if backend connectivity was briefly lost"""
        if not self.event_queue:
            return

        print(f"[Backend Client] 🔄 Retrying {len(self.event_queue)} queued events...")
        remaining = []
        for payload in self.event_queue:
            try:
                url = f"{self.backend_url}/api/cctv/events"
                res = requests.post(url, json=payload, headers=self.headers, timeout=3)
                if res.status_code not in [200, 201]:
                    remaining.append(payload)
            except Exception:
                remaining.append(payload)

        self.event_queue = remaining
