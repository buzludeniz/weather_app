import { useQuery } from "@tanstack/react-query";
import type { LocationResult } from "@nimbus/shared";
import { apiGet } from "../../services/apiClient";

export function useLocationSearch(query: string) {
  return useQuery({
    enabled: query.trim().length > 0,
    queryKey: ["locations", "search", query],
    queryFn: () => apiGet<LocationResult[]>("/locations/search", { q: query }),
    staleTime: 1000 * 60 * 60
  });
}
