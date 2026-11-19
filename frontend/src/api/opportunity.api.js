import api from "./axios";

export const opportunityApi = {
  createOpportunity: (data) => api.post("/opportunities", data),
  getOpportunities: (params = {}) => api.get("/opportunities", { params }),
  getRecommendedForMe: () => api.get("/opportunities/recommended/for-me"),
  getMyOpportunities: () => api.get("/opportunities/my"),
  getOpportunityById: (id) => api.get(`/opportunities/${id}`),
  getRecommendedDevelopers: (id) =>
    api.get(`/opportunities/${id}/recommended-developers`),
  updateOpportunity: (id, data) => api.patch(`/opportunities/${id}`, data),
  deleteOpportunity: (id) => api.delete(`/opportunities/${id}`),
};
