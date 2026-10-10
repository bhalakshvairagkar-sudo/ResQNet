"""
ResQNet Temporal Vehicle Tracker
Maintains persistent track IDs, computes velocities, headings, trajectories,
and acceleration/deceleration profiles across consecutive video frames.
"""

import math
import time
from typing import List, Dict, Any, Tuple, Optional
from config import CCTVConfig

class TrackedObject:
    def __init__(self, track_id: int, detection: Dict[str, Any], timestamp: float):
        self.track_id = track_id
        self.class_id = detection["class_id"]
        self.class_name = detection["class_name"]
        self.is_vehicle = detection["is_vehicle"]
        
        # Current state
        self.bbox = detection["bbox"]
        self.centroid = detection["centroid"]
        self.confidence = detection["confidence"]
        self.aspect_ratio = detection.get("aspect_ratio", 1.0)
        
        # Temporal history
        self.history: List[Tuple[float, float, float]] = [(self.centroid[0], self.centroid[1], timestamp)] # [(x, y, t)]
        self.bbox_history: List[Tuple[List[float], float]] = [(self.bbox, timestamp)]
        
        # Dynamic kinematic estimates
        self.velocity_px_s: float = 0.0
        self.previous_velocity_px_s: float = 0.0
        self.acceleration_px_s2: float = 0.0
        self.heading_deg: float = 0.0
        self.first_seen: float = timestamp
        self.last_seen: float = timestamp
        self.consecutive_misses: int = 0
        self.total_observed_frames: int = 1

    def update(self, detection: Dict[str, Any], timestamp: float):
        prev_x, prev_y, prev_t = self.history[-1]
        curr_x, curr_y = detection["centroid"]
        dt = timestamp - prev_t

        self.bbox = detection["bbox"]
        self.centroid = [curr_x, curr_y]
        self.confidence = detection["confidence"]
        self.aspect_ratio = detection.get("aspect_ratio", 1.0)
        self.last_seen = timestamp
        self.consecutive_misses = 0
        self.total_observed_frames += 1

        self.history.append((curr_x, curr_y, timestamp))
        self.bbox_history.append((self.bbox, timestamp))
        if len(self.history) > CCTVConfig.TRACK_MAX_AGE_FRAMES:
            self.history.pop(0)
            self.bbox_history.pop(0)

        if dt > 0.001:
            dx = curr_x - prev_x
            dy = curr_y - prev_y
            dist_px = math.sqrt(dx * dx + dy * dy)
            current_velocity = dist_px / dt

            # Compute acceleration / deceleration
            self.acceleration_px_s2 = (current_velocity - self.velocity_px_s) / dt
            self.previous_velocity_px_s = self.velocity_px_s
            self.velocity_px_s = (0.7 * current_velocity) + (0.3 * self.velocity_px_s) # Exponential smoothing

            # Heading calculation (0° = East, 90° = South, etc.)
            if dist_px > 3.0:
                self.heading_deg = math.degrees(math.atan2(dy, dx)) % 360.0

    def mark_missed(self):
        self.consecutive_misses += 1

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "class_name": self.class_name,
            "is_vehicle": self.is_vehicle,
            "confidence": self.confidence,
            "bbox": self.bbox,
            "centroid": self.centroid,
            "velocity_px_s": round(self.velocity_px_s, 1),
            "acceleration_px_s2": round(self.acceleration_px_s2, 1),
            "heading_deg": round(self.heading_deg, 1),
            "dwell_time_s": round(self.last_seen - self.first_seen, 2),
            "total_frames": self.total_observed_frames,
            "aspect_ratio": self.aspect_ratio
        }

class TemporalTracker:
    def __init__(self, max_distance_px: float = 75.0, max_missed_frames: int = 15):
        self.max_distance_px = max_distance_px
        self.max_missed_frames = max_missed_frames
        self.tracks: Dict[int, TrackedObject] = {}
        self.next_track_id: int = 1

    def update_tracks(self, detections: List[Dict[str, Any]], timestamp: Optional[float] = None) -> List[TrackedObject]:
        """
        Associates current frame detections with existing tracks using centroid distance & class matching.
        """
        curr_time = timestamp if timestamp is not None else time.time()

        if not detections:
            for track in self.tracks.values():
                track.mark_missed()
            self._prune_stale_tracks()
            return list(self.tracks.values())

        unmatched_detections = list(range(len(detections)))
        matched_tracks = set()

        # Match existing tracks with detections by minimum Euclidean distance
        for track_id, track in list(self.tracks.items()):
            best_idx = None
            best_dist = float("inf")

            for idx in unmatched_detections:
                det = detections[idx]
                if det["class_id"] != track.class_id:
                    continue

                dx = det["centroid"][0] - track.centroid[0]
                dy = det["centroid"][1] - track.centroid[1]
                dist = math.sqrt(dx * dx + dy * dy)

                if dist < self.max_distance_px and dist < best_dist:
                    best_dist = dist
                    best_idx = idx

            if best_idx is not None:
                track.update(detections[best_idx], curr_time)
                unmatched_detections.remove(best_idx)
                matched_tracks.add(track_id)
            else:
                track.mark_missed()

        # Create new tracks for remaining unmatched detections
        for idx in unmatched_detections:
            new_track = TrackedObject(self.next_track_id, detections[idx], curr_time)
            self.tracks[self.next_track_id] = new_track
            self.next_track_id += 1

        self._prune_stale_tracks()
        return list(self.tracks.values())

    def _prune_stale_tracks(self):
        stale_ids = [
            t_id for t_id, track in self.tracks.items()
            if track.consecutive_misses > self.max_missed_frames
        ]
        for t_id in stale_ids:
            del self.tracks[t_id]

    def reset(self):
        self.tracks.clear()
        self.next_track_id = 1
