const express = require('express');
const db = require('../database/db');

const timestamp = (incident, status) => incident.timeline?.find(item => item.status === status)?.timestamp || null;
const latency = (a, b) => a && b ? Math.max(0, new Date(b) - new Date(a)) : null;
module.exports = () => {
    const router = express.Router();
    const metrics = async () => {
        const incidents = await db.getAllIncidents();
        const records = incidents.map(i => { const detected = timestamp(i, 'DETECTED') || i.createdAt, dispatch = timestamp(i, 'EN_ROUTE') || i.dispatchedAt, arrival = timestamp(i, 'ARRIVED') || i.arrivedAt, alert = timestamp(i, 'HOSPITAL_PRE_ALERTED'), failover = timestamp(i, 'EN_ROUTE') && i.failoverAt; return { incident: i, detectionToDispatchMs: latency(detected, dispatch), dispatchToArrivalMs: latency(dispatch, arrival), detectionToPreAlertMs: latency(detected, alert), failoverLatencyMs: latency(failover, dispatch) }; });
        const average = key => { const values = records.map(r => r[key]).filter(Number.isFinite); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null; };
        return { generatedAt: new Date().toISOString(), activeIncidents: incidents.filter(i => i.status !== 'RESOLVED').length, criticalIncidents: incidents.filter(i => i.severity >= 75 && i.status !== 'RESOLVED').length, degradedRoutingCount: incidents.filter(i => i.route?.isFallback).length, multiSourceCorrelationCount: incidents.filter(i => (i.sources || []).length > 1).length, averageDispatchLatencyMs: average('detectionToDispatchMs'), averageArrivalLatencyMs: average('dispatchToArrivalMs'), averagePreAlertLatencyMs: average('detectionToPreAlertMs'), incidents: records };
    };
    router.get('/analytics/summary', async (_, res) => { const data = await metrics(); const [ambulances, hospitals] = await Promise.all([db.getAllAmbulances(), db.getAllHospitals()]); res.json({ ...data, availableAmbulances: ambulances.filter(a => a.status === 'AVAILABLE').length, ambulancesEnRoute: ambulances.filter(a => a.status === 'EN_ROUTE').length, hospitalsAvailable: hospitals.filter(h => h.status === 'AVAILABLE').length }); });
    router.get('/analytics/incidents', async (_, res) => res.json((await metrics()).incidents));
    router.get('/analytics/response-history', async (_, res) => res.json(await db.getResponseHistory()));
    router.get('/analytics/source-distribution', async (_, res) => { const counts = {}; (await db.getAllIncidents()).flatMap(i => i.sources || []).forEach(s => { counts[s.source || 'unknown'] = (counts[s.source || 'unknown'] || 0) + 1; }); res.json(counts); });
    router.get('/analytics/export', async (_, res) => res.json({ summary: await metrics(), responseHistory: await db.getResponseHistory() }));
    return router;
};
