import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../http/asyncHandler.js";
import { validate } from "../../middleware/validate.js";
import { getMapLayers, getWeatherBundle } from "./weather.service.js";

const CoordinatesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180)
});

export const weatherRouter = Router();

// Helper: set cache-status header based on generatedAt age
function setCacheHeader(res: any, generatedAt?: string) {
  if (!generatedAt) return;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  res.set("X-Cache-Age-Seconds", String(Math.round(ageMs / 1000)));
  res.set("X-Cache-Status", ageMs < 5000 ? "MISS" : "HIT");
}

weatherRouter.get("/bundle", validate({ query: CoordinatesQuerySchema }), asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const bundle = await getWeatherBundle(lat, lon);
  setCacheHeader(res, bundle.generatedAt);
  res.json({ data: bundle });
}));

weatherRouter.get("/current", validate({ query: CoordinatesQuerySchema }), asyncHandler(async (req, res) => {
  const bundle = await getWeatherBundle(Number(req.query.lat), Number(req.query.lon));
  setCacheHeader(res, bundle.generatedAt);
  res.json({ data: bundle.current, generatedAt: bundle.generatedAt });
}));

weatherRouter.get("/forecast", validate({ query: CoordinatesQuerySchema }), asyncHandler(async (req, res) => {
  const bundle = await getWeatherBundle(Number(req.query.lat), Number(req.query.lon));
  setCacheHeader(res, bundle.generatedAt);
  res.json({ data: { hourly: bundle.hourly, daily: bundle.daily }, generatedAt: bundle.generatedAt });
}));

weatherRouter.get("/air-quality", validate({ query: CoordinatesQuerySchema }), asyncHandler(async (req, res) => {
  const bundle = await getWeatherBundle(Number(req.query.lat), Number(req.query.lon));
  setCacheHeader(res, bundle.generatedAt);
  res.json({ data: bundle.airQuality, generatedAt: bundle.generatedAt });
}));

weatherRouter.get("/astronomy", validate({ query: CoordinatesQuerySchema }), asyncHandler(async (req, res) => {
  const bundle = await getWeatherBundle(Number(req.query.lat), Number(req.query.lon));
  setCacheHeader(res, bundle.generatedAt);
  res.json({ data: bundle.astronomy, generatedAt: bundle.generatedAt });
}));

weatherRouter.get("/alerts", validate({ query: CoordinatesQuerySchema }), asyncHandler(async (req, res) => {
  const bundle = await getWeatherBundle(Number(req.query.lat), Number(req.query.lon));
  setCacheHeader(res, bundle.generatedAt);
  res.json({ data: bundle.alerts, generatedAt: bundle.generatedAt });
}));

weatherRouter.get("/insights", validate({ query: CoordinatesQuerySchema }), asyncHandler(async (req, res) => {
  const bundle = await getWeatherBundle(Number(req.query.lat), Number(req.query.lon));
  setCacheHeader(res, bundle.generatedAt);
  res.json({ data: bundle.insights, generatedAt: bundle.generatedAt });
}));

weatherRouter.get("/maps/layers", asyncHandler(async (_req, res) => {
  res.json({ data: await getMapLayers() });
}));
