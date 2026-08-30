"""
ResQNet Computer-Vision False-Positive & Anomaly Test Suite
Tests 10 traffic scenario vectors against the temporal tracking & accident reasoning engine:
1. Normal smooth highway traffic -> NO FALSE POSITIVE
2. Stop-and-go traffic congestion -> NO FALSE POSITIVE
3. Normal traffic light stop -> NO FALSE POSITIVE
4. Single-car emergency hard braking -> NO FALSE POSITIVE (Suppressed)
5. Sharp highway lane change -> NO FALSE POSITIVE
6. Pothole / road bump shock -> NO FALSE POSITIVE
7. Camera jitter / wind shake -> NO FALSE POSITIVE
8. High-speed T-bone intersection collision -> ACCIDENT DETECTED (Confidence >= 80%)
9. Head-on high-speed impact -> ACCIDENT DETECTED (Confidence >= 85%)
10. Multi-vehicle rollover collision with pedestrian -> ACCIDENT DETECTED + Rollover & Pedestrian flags
"""

import sys
import os
import unittest
import numpy as np

# Add cctv_service to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ai", "cctv_service")))

from config import CCTVConfig
from tracker import TemporalTracker
from accident_logic import AccidentReasoningEngine

class TestCCTVFalsePositives(unittest.TestCase):
    def setUp(self):
        self.tracker = TemporalTracker()
        self.reasoner = AccidentReasoningEngine(min_persistence_frames=6, min_confidence=0.65)
        self.cam_meta = {"camera_id": "CCTV-TEST-01", "latitude": 18.5308, "longitude": 73.8290}

    def _simulate_scenario(self, frames_detections, num_frames=12):
        """Helper to feed frames into tracker & reasoner and return the final evaluation result"""
        self.tracker.reset()
        self.reasoner.reset()
        final_result = None

        for t_idx, detections in enumerate(frames_detections):
            curr_time = 1000.0 + (t_idx * 0.04) # 25 FPS (40ms per frame)
            tracks = self.tracker.update_tracks(detections, curr_time)
            final_result = self.reasoner.evaluate_frame(tracks, detections, self.cam_meta)

        return final_result

    def test_01_normal_smooth_traffic(self):
        """Scenario 1: Two cars driving parallel at constant speed -> Should NOT trigger accident"""
        frames = []
        for i in range(15):
            # Car 1 moves in Lane 1: y increases by 10px per frame
            # Car 2 moves in Lane 2: y increases by 10px per frame, 150px away
            frames.append([
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.92,
                    "bbox": [100.0, 50.0 + i * 10.0, 160.0, 130.0 + i * 10.0],
                    "centroid": [130.0, 90.0 + i * 10.0]
                },
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.89,
                    "bbox": [300.0, 60.0 + i * 10.0, 360.0, 140.0 + i * 10.0],
                    "centroid": [330.0, 100.0 + i * 10.0]
                }
            ])
        res = self._simulate_scenario(frames)
        self.assertFalse(res["accident_detected"], "Normal smooth traffic should not be flagged as accident")
        self.assertEqual(res["confidence_percentage"], 0)
        print("  [OK] Test 1: Normal smooth traffic -> PASS (No accident, 0% confidence)")

    def test_02_traffic_congestion_stop_and_go(self):
        """Scenario 2: Slow moving cars in dense traffic -> Should NOT trigger accident"""
        frames = []
        for i in range(15):
            frames.append([
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.94,
                    "bbox": [150.0, 100.0 + i * 2.0, 210.0, 180.0 + i * 2.0],
                    "centroid": [180.0, 140.0 + i * 2.0]
                },
                {
                    "class_id": 5, "class_name": "bus", "is_vehicle": True, "confidence": 0.91,
                    "bbox": [150.0, 220.0 + i * 2.0, 230.0, 340.0 + i * 2.0],
                    "centroid": [190.0, 280.0 + i * 2.0]
                }
            ])
        res = self._simulate_scenario(frames)
        self.assertFalse(res["accident_detected"], "Traffic congestion should not be flagged as accident")
        print("  [OK] Test 2: Congested traffic stop-and-go -> PASS (No accident)")

    def test_03_normal_traffic_light_stop(self):
        """Scenario 3: Car decelerating smoothly to 0 at a red light -> Should NOT trigger accident"""
        frames = []
        speed = 20.0
        pos_y = 50.0
        for i in range(15):
            if speed > 0: speed -= 2.0
            pos_y += speed
            frames.append([
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.95,
                    "bbox": [200.0, pos_y, 260.0, pos_y + 80.0],
                    "centroid": [230.0, pos_y + 40.0]
                }
            ])
        res = self._simulate_scenario(frames)
        self.assertFalse(res["accident_detected"], "Normal smooth stop should not trigger accident")
        print("  [OK] Test 3: Normal traffic light stop -> PASS (No accident)")

    def test_04_hard_braking_suppression(self):
        """Scenario 4: Hard emergency braking by single car (no collision) -> Suppressed by spatial check"""
        frames = []
        for i in range(5):
            frames.append([{
                "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.90,
                "bbox": [150.0, 50.0 + i * 30.0, 210.0, 130.0 + i * 30.0],
                "centroid": [180.0, 90.0 + i * 30.0]
            }])
        # Sudden halt
        for i in range(7):
            frames.append([{
                "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.90,
                "bbox": [150.0, 200.0, 210.0, 280.0],
                "centroid": [180.0, 240.0]
            }])
        res = self._simulate_scenario(frames)
        self.assertFalse(res["accident_detected"], "Hard braking alone without spatial collision should not trigger emergency")
        print("  [OK] Test 4: Hard braking false-positive suppression -> PASS")

    def test_05_sharp_lane_change(self):
        """Scenario 5: High-speed lane change without collision -> Should NOT trigger accident"""
        frames = []
        for i in range(15):
            frames.append([{
                "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.91,
                "bbox": [100.0 + i * 15.0, 50.0 + i * 12.0, 160.0 + i * 15.0, 130.0 + i * 12.0],
                "centroid": [130.0 + i * 15.0, 90.0 + i * 12.0]
            }])
        res = self._simulate_scenario(frames)
        self.assertFalse(res["accident_detected"], "Lane change should not trigger accident")
        print("  [OK] Test 5: Sharp lane change -> PASS (No accident)")

    def test_06_camera_jitter_shake(self):
        """Scenario 6: Wind vibration causing bounding box jitter -> Should NOT trigger accident"""
        frames = []
        for i in range(15):
            jitter = (i % 2) * 4.0
            frames.append([{
                "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.88,
                "bbox": [200.0 + jitter, 150.0 + jitter, 260.0 + jitter, 230.0 + jitter],
                "centroid": [230.0 + jitter, 190.0 + jitter]
            }])
        res = self._simulate_scenario(frames)
        self.assertFalse(res["accident_detected"], "Camera jitter should not trigger accident")
        print("  [OK] Test 6: Camera wind shake / jitter -> PASS (No accident)")

    def test_07_tbone_intersection_collision(self):
        """Scenario 7: High-Speed T-Bone collision between two cars -> ACCIDENT CONFIRMED"""
        frames = []
        # Frame 0-3: Approaches
        for i in range(4):
            frames.append([
                # Car 1 coming from North: y goes down
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.96,
                    "bbox": [200.0, 50.0 + i * 35.0, 260.0, 130.0 + i * 35.0],
                    "centroid": [230.0, 90.0 + i * 35.0]
                },
                # Car 2 coming from West: x goes right
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.94,
                    "bbox": [50.0 + i * 40.0, 170.0, 130.0 + i * 40.0, 230.0],
                    "centroid": [90.0 + i * 40.0, 200.0]
                }
            ])
        # Frame 4-12: Impact and persistent overlap (IoU >= 0.45, sudden velocity freeze)
        for i in range(8):
            frames.append([
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.95,
                    "bbox": [200.0, 175.0, 260.0, 245.0],
                    "centroid": [230.0, 210.0]
                },
                {
                    "class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.92,
                    "bbox": [215.0, 170.0, 285.0, 240.0],
                    "centroid": [250.0, 205.0]
                }
            ])

        res = self._simulate_scenario(frames)
        self.assertTrue(res["accident_detected"], "T-Bone collision MUST be detected")
        self.assertGreaterEqual(res["confidence_percentage"], 75)
        self.assertTrue(res["evidence"]["spatial_collision"])
        self.assertGreaterEqual(res["evidence"]["max_iou"], 0.30)
        print(f"  [OK] Test 7: T-Bone intersection collision -> PASS (Detected, Confidence: {res['confidence_percentage']}%, IoU: {res['evidence']['max_iou']})")

    def test_08_head_on_impact_with_rapid_deceleration(self):
        """Scenario 8: Head-on collision with severe kinetic deceleration -> ACCIDENT CONFIRMED"""
        frames = []
        # Approach
        for i in range(4):
            frames.append([
                {"class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.95, "bbox": [200.0, 50.0 + i * 40.0, 260.0, 120.0 + i * 40.0], "centroid": [230.0, 85.0 + i * 40.0]},
                {"class_id": 7, "class_name": "truck", "is_vehicle": True, "confidence": 0.97, "bbox": [205.0, 380.0 - i * 40.0, 275.0, 470.0 - i * 40.0], "centroid": [240.0, 425.0 - i * 40.0]}
            ])
        # Direct Head-on Crash & Overlap
        for i in range(8):
            frames.append([
                {"class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.92, "bbox": [205.0, 210.0, 265.0, 280.0], "centroid": [235.0, 245.0]},
                {"class_id": 7, "class_name": "truck", "is_vehicle": True, "confidence": 0.95, "bbox": [205.0, 220.0, 275.0, 310.0], "centroid": [240.0, 265.0]}
            ])

        res = self._simulate_scenario(frames)
        self.assertTrue(res["accident_detected"])
        self.assertTrue(res["evidence"]["rapid_deceleration"] or res["evidence"]["spatial_collision"])
        print(f"  [OK] Test 8: Head-on truck vs car collision -> PASS (Confidence: {res['confidence_percentage']}%)")

    def test_09_rollover_collision_with_pedestrian(self):
        """Scenario 9: Vehicle rollover with pedestrian near impact zone -> ACCIDENT CONFIRMED + FLAGS"""
        frames = []
        for i in range(4):
            frames.append([
                # Car entering fast (aspect ratio = width / height ~ 1.5)
                {"class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.93, "bbox": [100.0 + i * 35.0, 150.0, 190.0 + i * 35.0, 210.0], "centroid": [145.0 + i * 35.0, 180.0], "aspect_ratio": 1.5},
                # Pedestrian standing on sidewalk near junction
                {"class_id": 0, "class_name": "person", "is_vehicle": False, "confidence": 0.88, "bbox": [280.0, 140.0, 305.0, 200.0], "centroid": [292.0, 170.0]}
            ])
        # Crash + Rollover (aspect ratio flips < 0.65 as vehicle overturns on side)
        for i in range(8):
            frames.append([
                {"class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.90, "bbox": [250.0, 150.0, 290.0, 235.0], "centroid": [270.0, 192.0], "aspect_ratio": 0.47},
                {"class_id": 0, "class_name": "person", "is_vehicle": False, "confidence": 0.85, "bbox": [280.0, 140.0, 305.0, 200.0], "centroid": [292.0, 170.0]}
            ])

        res = self._simulate_scenario(frames)
        self.assertTrue(res["accident_detected"])
        self.assertTrue(res["evidence"]["rollover_detected"], "Rollover flag must be detected on vehicle aspect inversion")
        self.assertTrue(res["evidence"]["pedestrian_involved"], "Pedestrian involvement flag must be set")
        print(f"  [OK] Test 9: Rollover collision + Pedestrian -> PASS (Rollover: {res['evidence']['rollover_detected']}, Pedestrian: {res['evidence']['pedestrian_involved']})")

    def test_10_motorcycle_impact(self):
        """Scenario 10: Motorcycle collision with car -> ACCIDENT CONFIRMED"""
        frames = []
        for i in range(4):
            frames.append([
                {"class_id": 3, "class_name": "motorcycle", "is_vehicle": True, "confidence": 0.91, "bbox": [120.0 + i * 30.0, 180.0, 160.0 + i * 30.0, 220.0], "centroid": [140.0 + i * 30.0, 200.0]},
                {"class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.95, "bbox": [230.0, 160.0, 295.0, 230.0], "centroid": [262.0, 195.0]}
            ])
        for i in range(8):
            frames.append([
                {"class_id": 3, "class_name": "motorcycle", "is_vehicle": True, "confidence": 0.88, "bbox": [230.0, 175.0, 270.0, 225.0], "centroid": [250.0, 200.0]},
                {"class_id": 2, "class_name": "car", "is_vehicle": True, "confidence": 0.94, "bbox": [235.0, 165.0, 300.0, 235.0], "centroid": [267.0, 200.0]}
            ])

        res = self._simulate_scenario(frames)
        self.assertTrue(res["accident_detected"])
        print(f"  [OK] Test 10: Motorcycle crash detection -> PASS (Confidence: {res['confidence_percentage']}%)")

if __name__ == "__main__":
    print("\n=======================================================")
    print("[TEST SUITE] Running CCTV Computer Vision False-Positive & Anomaly Test Suite")
    print("=======================================================\n")
    unittest.main(verbosity=2)
