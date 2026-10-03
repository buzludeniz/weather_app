import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../http/asyncHandler.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { featuredLocations, searchLocations } from "./locations.service.js";
import {
  installationExists,
  listSavedLocations,
  replaceSavedLocations,
  type SavedLocationInput
} from "./savedLocations.service.js";

const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional()
});

const InstallationParamsSchema = z.object({
  installationId: z.string().uuid("installationId must be a UUID")
});

const SavedLocationSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional(),
  country: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional()
});

const ReplaceSavedLocationsSchema = z.object({
  locations: z.array(SavedLocationSchema).max(50)
});

export const locationsRouter = Router();

locationsRouter.get("/", asyncHandler(async (_req, res) => {
  res.json({ data: featuredLocations() });
}));

locationsRouter.get("/search", validate({ query: SearchQuerySchema }), asyncHandler(async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  res.json({ data: await searchLocations(query) });
}));

locationsRouter.get(
  "/saved/:installationId",
  validate({ params: InstallationParamsSchema }),
  asyncHandler(async (req, res) => {
    const { installationId } = req.params as z.infer<typeof InstallationParamsSchema>;
    if (!(await installationExists(installationId))) {
      throw new HttpError(404, "Installation not found", "installation_not_found");
    }
    res.json({ data: await listSavedLocations(installationId) });
  })
);

/**
 * Full replace of the installation's saved set.
 *
 * The phone is the source of truth for its own list, so the payload is the
 * complete desired state rather than a set of adds and removes. That keeps the
 * client simple and leaves the server's job unambiguous.
 */
locationsRouter.put(
  "/saved/:installationId",
  validate({ params: InstallationParamsSchema, body: ReplaceSavedLocationsSchema }),
  asyncHandler(async (req, res) => {
    const { installationId } = req.params as z.infer<typeof InstallationParamsSchema>;
    const { locations } = req.body as z.infer<typeof ReplaceSavedLocationsSchema>;
    if (!(await installationExists(installationId))) {
      throw new HttpError(404, "Installation not found", "installation_not_found");
    }
    const data = await replaceSavedLocations(installationId, locations as SavedLocationInput[]);
    res.json({ data });
  })
);

