"""
ResQNet Temporal Multi-Evidence Accident Reasoning Engine
Combines spatial overlap, kinematics, trajectory shifts, rollover signals, and
a multi-frame confirmation window to reliably detect collisions while suppressing false positives.
"""

import math
import time
from typing import List, Dict, Any, Tuple, Optional
from config import CCTVConfig
from tracker import TrackedObject

class AccidentReasoningEngine:
    def __init__(self, min_persistence_frames: Optional[int] = None, min_confidence: Optional[float] = None):
        self.min_persistence_frames = min_persistence_frames or CCTVConfig.MIN_PERSISTENCE_FRAMES
        self.min_confidence = min_confidence or CCTVConfig.MIN_ACCIDENT_CONFIDENCE
        
        # State tracking for confirmation window
        self.active_anomaly_frames: int = 0
        self.last_candidate_evidence: Dict[str, Any] = {}
        self.last_event_time: float = 0.0

    @staticmethod
    def compute_iou(boxA: List[float], boxB: List[float]) -> float:
        """Computes Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2]"""
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])
        
        interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
        boxAArea = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
        boxBArea = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
        
        denom = float(boxAArea + boxBArea - interArea)
        return (interArea / denom) if denom > 0.0 else 0.0

    @staticmethod
    def compute_distance(ptA: List[float], ptB: List[float]) -> float:
        dx = ptA[0] - ptB[0]
        dy = ptA[1] - ptB[1]
        return math.sqrt(dx * dx + dy * dy)

    def evaluate_frame(
        self,
        tracks: List[TrackedObject],
        detections: List[Dict[str, Any]],
        camera_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluates a single frame's active tracks and detections for collision evidence.
        Applies multi-signal scoring and a multi-frame confirmation window.
        """
        vehicles = [t for t in tracks if t.is_vehicle]
        pedestrians = [t for t in tracks if not t.is_vehicle]
        
        # Evidence signals
        max_iou = 0.0
        colliding_pair: Optional[Tuple[int, int]] = None
        has_spatial_collision = False
        has_rapid_deceleration = False
        has_trajectory_anomaly = False
        has_rollover_signal = False
        has_pedestrian_involvement = False
        involved_track_ids: List[int] = []

        # 1. Pairwise Spatial Collision & Convergence Evaluation
        for i in range(len(vehicles)):
            for j in range(i + 1, len(vehicles)):
                v1 = vehicles[i]
                v2 = vehicles[j]
                
                iou = self.compute_iou(v1.bbox, v2.bbox)
                if iou > max_iou:
                    max_iou = iou
                    colliding_pair = (v1.track_id, v2.track_id)

                dist_px = self.compute_distance(v1.centroid, v2.centroid)

                # Overlap collision condition
                if iou >= CCTVConfig.COLLISION_IOU_THRESHOLD:
                    has_spatial_collision = True
                    involved_track_ids.extend([v1.track_id, v2.track_id])

                # High-speed converging trajectory condition (< 50px centroid distance & opposite headings)
                elif dist_px < CCTVConfig.PROXIMITY_CONVERGENCE_PX:
                    heading_diff = abs(v1.heading_deg - v2.heading_deg)
                    if 120.0 <= heading_diff <= 240.0: # Head-on / angled intersection vector
                        has_spatial_collision = True
                        involved_track_ids.extend([v1.track_id, v2.track_id])

        # 2. Kinematic Deceleration & Trajectory Anomaly Evaluation
        for v in vehicles:
            # Check for sudden deceleration (speed drop by > 55%)
            if v.previous_velocity_px_s > 40.0 and v.velocity_px_s < (v.previous_velocity_px_s * (1.0 - CCTVConfig.RAPID_DECELERATION_RATIO)):
                has_rapid_deceleration = True
                if v.track_id not in involved_track_ids:
                    involved_track_ids.append(v.track_id)

            # Check for sudden direction jerk (> 60° heading change with high deceleration)
            if len(v.history) >= 4:
                p_old = v.history[-4]
                p_mid = v.history[-2]
                p_new = v.history[-1]
                h_old = math.degrees(math.atan2(p_mid[1] - p_old[1], p_mid[0] - p_old[0])) % 360.0
                h_new = math.degrees(math.atan2(p_new[1] - p_mid[1], p_new[0] - p_mid[0])) % 360.0
                if abs(h_new - h_old) > 60.0 and v.acceleration_px_s2 < -30.0:
                    has_trajectory_anomaly = True
                    if v.track_id not in involved_track_ids:
                        involved_track_ids.append(v.track_id)

            # Check for rollover indicator (aspect ratio inversion or vertical orientation shift)
            if v.class_name in ["car", "bus", "truck"] and len(v.bbox_history) >= 3:
                initial_aspect = v.bbox_history[0][0][2] - v.bbox_history[0][0][0] / max(1.0, (v.bbox_history[0][0][3] - v.bbox_history[0][0][1]))
                curr_aspect = v.aspect_ratio
                if (initial_aspect > 1.3 and curr_aspect < 0.75) or (curr_aspect < 0.60 and has_spatial_collision):
                    has_rollover_signal = True

        # 3. Pedestrian Involvement Near Incident Zone
        if (has_spatial_collision or has_rapid_deceleration or has_rollover_signal) and len(pedestrians) > 0:
            for p in pedestrians:
                # Check distance to any involved vehicle or nearest vehicle
                target_vehicles = [v for v in vehicles if v.track_id in involved_track_ids] or vehicles
                for v_match in target_vehicles:
                    if self.compute_distance(p.centroid, v_match.centroid) < 80.0:
                        has_pedestrian_involvement = True
                        break

        # 4. Multi-Signal Probabilistic Confidence Formulation
        base_confidence = 0.0
        if has_spatial_collision:
            # Spatial overlap contributes 55-85% depending on IoU magnitude
            base_confidence += 0.55 + min(0.30, max_iou * 0.6)

        if has_rollover_signal:
            # Vehicle rollover / overturn on roadway is an acute physical emergency
            base_confidence += 0.65

        if has_rapid_deceleration:
            base_confidence += 0.20

        if has_trajectory_anomaly:
            base_confidence += 0.15

        if has_pedestrian_involvement:
            base_confidence += 0.10

        calculated_confidence = min(0.99, base_confidence)

        # 5. Temporal Confirmation Window (Suppresses 1-Frame False Positives)
        is_candidate_anomaly = (calculated_confidence >= 0.50)

        if is_candidate_anomaly:
            self.active_anomaly_frames += 1
        else:
            self.active_anomaly_frames = max(0, self.active_anomaly_frames - 1)

        is_confirmed_accident = (
            self.active_anomaly_frames >= self.min_persistence_frames and
            calculated_confidence >= self.min_confidence
        )

        evidence_payload = {
            "spatial_collision": has_spatial_collision,
            "max_iou": round(max_iou, 3),
            "rapid_deceleration": has_rapid_deceleration,
            "trajectory_anomaly": has_trajectory_anomaly,
            "rollover_detected": has_rollover_signal,
            "pedestrian_involved": has_pedestrian_involvement,
            "involved_track_ids": list(set(involved_track_ids)),
            "active_anomaly_frames": self.active_anomaly_frames,
            "min_required_frames": self.min_persistence_frames,
            "is_confirmed": is_confirmed_accident
        }

        return {
            "accident_detected": is_confirmed_accident,
            "confidence": round(calculated_confidence, 3) if is_candidate_anomaly else 0.0,
            "confidence_percentage": round(calculated_confidence * 100) if is_candidate_anomaly else 0,
            "evidence": evidence_payload,
            "vehicle_count": len(vehicles),
            "pedestrian_count": len(pedestrians),
            "colliding_pair": colliding_pair
        }

    def reset(self):
        self.active_anomaly_frames = 0
        self.last_candidate_evidence = {}
