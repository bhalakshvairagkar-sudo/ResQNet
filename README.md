# ResQNet

**AI-Powered, Camera-Independent Emergency Response & Coordination Network**

Real-Time Emergency Response & Rescue Coordination Network

ResQNet is an intelligent emergency-response platform designed to
reduce the time between accident detection and coordinated medical
intervention.

ResQNet connects the person in distress, ambulance, hospital, and
emergency command center through a single real-time coordination
backbone.

Instead of treating an accident as a notification that someone must
manually act on, ResQNet turns it into a structured emergency
incident that can be detected, located, prioritized, assigned,
tracked, acknowledged, and resolved.

🚨 The Problem

During a serious road accident, the first few minutes can determine the
outcome.

Traditional emergency workflows can involve:

Accident
   ↓
Someone notices
   ↓
Someone calls for help
   ↓
Location is communicated
   ↓
Emergency services are contacted
   ↓
Ambulance availability is checked
   ↓
Hospital is contacted
   ↓
Coordination happens manually

This can create:

delayed accident reporting

inaccurate or incomplete location information

fragmented communication

difficulty identifying the nearest suitable ambulance

difficulty selecting an appropriate hospital

poor real-time visibility for emergency operators

alerts reaching the wrong resources or too many resources

ResQNet changes the model.

ACCIDENT
   ↓
DETECT
   ↓
LOCATE
   ↓
CREATE INCIDENT
   ↓
ASSESS
   ↓
SELECT
   ├── nearest suitable ambulance
   └── nearest suitable hospital
   ↓
TARGET
   ├── ambulance alert
   └── hospital alert
   ↓
COORDINATE
   ↓
TRACK
   ↓
RESOLVE

🎯 What ResQNet Does

ResQNet is built around one principle:

Get the right emergency information to the right responder at the
right location as quickly as possible.

The platform provides:

crash/emergency detection through the Android application

actual device-location acquisition

role-based authentication

dedicated user, ambulance, and hospital experiences

emergency incident creation

nearest-resource selection

targeted ambulance alerts

targeted hospital alerts

persistent emergency alerts

ambulance accept/reject workflow

automatic ambulance reassignment

hospital acknowledgement

real-time Socket.IO communication

live ambulance telemetry

route and ETA integration

Google Maps-compatible accident-location links

centralized Command Center

real-time operational map

incident timeline and operational state

demo/test mode for controlled simulations

offline/retry-oriented emergency handling

🧠 System Architecture

                           ┌──────────────────────────┐
                           │    RESQNET ANDROID APP   │
                           │     DEFAULT: LOGIN       │
                           └────────────┬─────────────┘
                                        │
                       Backend authentication
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
       ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
       │ USER PORTAL │           │  AMBULANCE  │           │  HOSPITAL   │
       │ Crash       │           │   PORTAL    │           │   PORTAL    │
       │ Detection   │           │ Dispatch    │           │ Trauma      │
       │ GPS         │           │ Accept      │           │ Alerts      │
       │ Status      │           │ Reject      │           │ Acknowledge │
       │ Local Save  │           │ Live GPS    │           │ Status      │
       │ Retry Sync  │           │ Telemetry   │           │ Readiness   │
       └──────┬──────┘           └──────┬──────┘           └──────┬──────┘
              │                         │                         │
              └─────────────────────────┼─────────────────────────┘
                                        │
                              HTTPS / WebSocket
                                        │
                                        ▼
              ╔════════════════════════════════════════════════════╗
              ║                  RESQNET BACKEND                  ║
              ║                                                    ║
              ║ Authentication & Authorization                     ║
              ║ Incident Ingestion                                 ║
              ║ Incident Processing                                ║
              ║ Resource Selection                                 ║
              ║ Targeted Alert Delivery                            ║
              ║ Routing / ETA                                      ║
              ║ Dispatch State Machine                             ║
              ║ Socket.IO Real-Time Communication                  ║
              ║ MongoDB Persistence                                ║
              ║ Emergency Alert Persistence                       ║
              ╚═══════════════════════╦════════════════════════════╝
                                      │
                                      │ Real-time operational data
                                      ▼
              ┌───────────────────────────────────────────────────┐
              │             COMMAND CENTER — WEB                  │
              │                                                   │
              │ 🗺️ Real-Time Operations Map                       │
              │ 🔴 Active Incidents                               │
              │ 🚑 Live Ambulances                                │
              │ 🏥 Hospitals                                      │
              │ 📊 Fleet / Incident Status                        │
              │ 🧾 Event Timeline                                 │
              │ 🧪 Test / Simulation Mode                         │
              └───────────────────────────────────────────────────┘

Role Separation

Role                    Interface               Responsibility

👤 USER                 Android                 Emergency protection,
accident status,
location

🚑 AMBULANCE            Android                 Receive targeted
dispatch,
accept/reject,
telemetry

🏥 HOSPITAL             Android                 Receive targeted trauma
alert, acknowledge

🧠 BACKEND              Node.js                 Authentication,
intelligence, dispatch,
persistence

The backend remains the single source of truth.

🔥 Core Emergency Workflow

1. ACCIDENT DETECTED
        ↓
2. LOCATION ACQUIRED
        ↓
3. INCIDENT CREATED
        ↓
4. INCIDENT VALIDATED
        ↓
5. SEVERITY / PRIORITY ASSESSED
        ↓
6. NEAREST SUITABLE AMBULANCE SELECTED
        ↓
7. NEAREST SUITABLE HOSPITAL SELECTED
        ↓
8. TARGETED ALERTS SENT
        ↓
9. AMBULANCE ACCEPTS / REJECTS
        ↓
10. HOSPITAL ACKNOWLEDGES
        ↓
11. AMBULANCE GOES EN_ROUTE
        ↓
12. LIVE LOCATION TELEMETRY
        ↓
13. AMBULANCE ARRIVES
        ↓
14. INCIDENT RESOLVED

📱 Android Application

The Android application has a single entry point:

LOGIN
  │
  ├── USER
  │     └── User Portal
  │
  ├── AMBULANCE
  │     └── Ambulance Portal
  │
  └── HOSPITAL
        └── Hospital Portal

The backend determines the role after authentication.

The Android client does not independently decide what role a user is
allowed to access.

User Portal

Designed around emergency protection:

crash monitoring

GPS/location state

network state

battery information where available

emergency incident status

ambulance assignment/status

hospital notification status

incident history

local persistence/retry support

🚑 Ambulance Portal

Provides:

ambulance identity

availability/status

current assignment

targeted emergency alerts

accident location

map link

help message

distance

ETA where available

accept/reject dispatch

live location telemetry

Typical state:

AVAILABLE
    ↓
ALERTED
    ↓
ACCEPTED
    ↓
EN_ROUTE
    ↓
ARRIVED

If an ambulance rejects an assignment, the backend can perform
reassignment to another eligible resource.

🏥 Hospital Portal

Provides:

hospital identity

operational state

targeted trauma alerts

incident information

accident location

ambulance information

ETA where available

help message

map link

alert acknowledgement

Typical state:

ALERT RECEIVED
      ↓
ACKNOWLEDGED
      ↓
PREPARING
      ↓
AMBULANCE ARRIVING

🎯 Targeted Emergency Dispatch

ResQNet does not simply broadcast an accident to every ambulance and
hospital.

                    ACCIDENT
                       │
                       ▼
                RESQNET BACKEND
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       Eligible Fleet      Eligible Hospitals
             │                   │
             ▼                   ▼
       Distance / ETA       Distance / ETA
             │                   │
             ▼                   ▼
       AMBULANCE #1         HOSPITAL #1
             │                   │
             ▼                   ▼
        ONLY THIS APP       ONLY THIS APP

Socket.IO rooms are used to target authenticated recipients,
conceptually:

ambulance:AMB-001
hospital:HOSP-001
role:COMMAND_CENTER

📍 Location Intelligence

Accident location is a critical part of every emergency.

ResQNet is designed to use actual device/location data rather than
hardcoded coordinates.

Location information can include:

{
  "latitude": 18.5204,
  "longitude": 73.8567,
  "accuracyMeters": 12.4,
  "timestamp": "2026-08-26T00:00:00Z",
  "quality": "HIGH"
}

If location is unavailable, represent it explicitly as unavailable.
Never silently substitute fake coordinates.

🗺️ Mapping & Routing

The Command Center provides a real-time operational map representing:

🔴 Accident
🚑 Ambulance
🏥 Hospital

When ambulance telemetry changes, the corresponding map marker can move
in real time without a page refresh.

Routing can use:

OSRM when available

Haversine geographic-distance fallback

Routing failure should not prevent emergency alert delivery.

🚨 Emergency Alert

Every targeted alert should contain actionable information.

🚨 CRITICAL EMERGENCY

ROAD ACCIDENT DETECTED

Incident:
RNQ-8A92F1

Severity:
CRITICAL

📍 Accident Location
18.5204, 73.8567

📏 Distance
2.4 km

⏱ ETA
5 min

🆘 HELP
Immediate medical assistance required.
Proceed to the accident location and
assess the victim(s).

📍 OPEN ACCIDENT LOCATION

The location link is generated from actual incident coordinates.

🔄 Real-Time Communication

ResQNet uses Socket.IO as its real-time communication layer.

Representative event categories:

incident:new
incident:updated

ambulance:location:update
ambulance:status:update

hospital:status:update

dispatch:assigned
dispatch:accepted
dispatch:reassigned

hospital:acknowledged

The intended model is:

Backend state change
        ↓
Socket.IO event
        ↓
Authorized clients
        ↓
Immediate UI update

🧭 Dispatch State Machine

                 ┌───────────────┐
                 │ INCIDENT NEW  │
                 └───────┬───────┘
                         ↓
                 ┌───────────────┐
                 │ RESOURCE      │
                 │ SELECTION     │
                 └───────┬───────┘
                         ↓
                 ┌───────────────┐
                 │ ALERTED       │
                 └───────┬───────┘
                         │
              ┌──────────┴──────────┐
              ↓                     ↓
          ACCEPTED               REJECTED
              │                     │
              ↓                     ↓
          EN_ROUTE             REASSIGNMENT
              │                     │
              ↓                     └──→ NEW ALERT
           ARRIVED
              │
              ↓
          RESOLVED

Hospital acknowledgement runs alongside the ambulance workflow.

🗄️ Persistence

MongoDB/Mongoose stores operational state, including entities such as:

users/authentication data

ambulances

hospitals

incidents

emergency alerts

response/operational information

audit/event data where implemented

Emergency alerts are persisted rather than relying exclusively on a live
Socket.IO connection.

🔐 Security Model

ResQNet uses role-based access control.

USER
 └── Own emergency information

AMBULANCE
 └── Own assignments + alerts + telemetry

HOSPITAL
 └── Own alerts + acknowledgement

COMMAND CENTER
 └── Authorized global operational visibility

The backend is authoritative for authentication, roles, permissions,
assignments, and alert recipients.

🧪 Test / Simulation Mode

For demonstrations and controlled testing, the Command Center can
define:

accident location

ambulance location

hospital location

severity

test help message

Test incidents should use the same dispatch pipeline as real incidents:

TEST ACCIDENT
     ↓
REAL INCIDENT PIPELINE
     ↓
REAL RESOURCE SELECTION
     ↓
REAL TARGETED ALERTS
     ↓
REAL PORTAL UPDATES

Demo data should remain clearly identifiable as simulation data.

🧑‍💻 Demonstration Scenario

Login to User, Ambulance, and Hospital Android portals.

Configure ambulance/hospital positions from the Command Center Test
Mode.

Trigger an accident.

Obtain the accident location.

Backend selects the nearest eligible ambulance and suitable
hospital.

Only the selected ambulance receives the dispatch.

Only the selected hospital receives the trauma alert.

Ambulance accepts.

Hospital acknowledges.

Ambulance sends live location.

Controller map shows the ambulance moving.

Ambulance arrives.

Incident resolves.

This demonstrates a complete closed-loop emergency workflow.

🧱 Technology Stack

Android

Kotlin / Android

Gradle

Android sensor/location APIs

Android networking

Socket.IO integration where applicable

Backend

Node.js

Express

Socket.IO

MongoDB

Mongoose

REST APIs

Role-based authentication

Command Center

HTML/CSS/JavaScript architecture already present in the project

Leaflet/map infrastructure where implemented

Socket.IO real-time updates

Routing / Location

OSRM where available

Haversine distance fallback

Google Maps-compatible location links

📂 Repository Structure

A representative high-level structure:

ResQNet/
│
├── android/
│   ├── app/
│   ├── gradle/
│   ├── build.gradle
│   ├── gradle.properties
│   └── gradlew.bat
│
├── backend/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
├── dashboard/
│   ├── dashboard.html
│   └── ...
│
└── README.md

Use the actual repository structure as the source of truth.

⚙️ Local Development

Backend

cd backend
npm install
npm start

Validation:

npm run validate

Android

cd android
.\gradlew.bat test --no-daemon
.\gradlew.bat assembleDebug --no-daemon

Open the android directory in Android Studio to run on an emulator or
physical device.

🔑 Demo Authentication

Demo identities are configurable through backend configuration.

Typical identities:

USER
user1

AMBULANCE
ambulance1
ambulance2
ambulance3

HOSPITAL
hospital1
hospital2
hospital3

COMMAND CENTER
operator

Do not use demonstration passwords as production credentials. Configure
secrets through environment variables.

🛡️ Reliability Principles

No fake location

Unavailable GPS is represented explicitly.

No global emergency spam

Emergency alerts are targeted.

Backend is authoritative

Clients cannot decide their own permissions or assignments.

Real-time state

Operational changes synchronize immediately.

Persistence

Critical alerts survive temporary client disconnections where supported.

Failover

Rejected assignments can be reassigned.

Graceful degradation

Routing/GPS degradation should not completely destroy emergency
coordination.

🔮 Future Development

Potential extensions include:

advanced crash-confidence modeling

richer multi-sensor fusion

improved severity classification

traffic-aware dispatch optimization

hospital capacity integration

emergency-department readiness

multi-ambulance coordination

live route recalculation

geofenced incident zones

stronger offline-first behavior

encrypted local emergency storage

production-grade identity management

push notifications

advanced analytics

historical response-time analysis

incident replay

predictive resource positioning

multi-agency interoperability

🏆 Why ResQNet Is Different

Many emergency applications focus on detecting an accident or sending an
SOS.

ResQNet focuses on the entire response chain:

DETECT
  ↓
LOCATE
  ↓
UNDERSTAND
  ↓
SELECT
  ↓
ALERT
  ↓
ACCEPT
  ↓
TRACK
  ↓
ACKNOWLEDGE
  ↓
ARRIVE
  ↓
RESOLVE

The goal is not merely:

"An accident happened."

It is:

"An accident happened here, this is what we know about it, this is
the nearest suitable ambulance, this is the appropriate hospital,
these responders have been notified, this ambulance is moving, this
hospital has acknowledged, and the Command Center can see the response
in real time."

👥 Project

ResQNet --- Emergency Operations Intelligence & Response Platform

Connecting:

People → Ambulances → Hospitals → Command Centers

Vision

When an accident happens, the system should not wait for coordination to begin.

ResQNet begins coordinating immediately.

⚠️ Disclaimer

ResQNet is an engineering/project demonstration platform.

It is not a replacement for official emergency services, medical
professionals, dispatch authorities, or certified safety systems.
Production deployment would require appropriate regulatory, security,
privacy, medical-safety, telecommunications, and emergency-services
validation.
