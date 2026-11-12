import api from "./axios";

export const applicationApi = {
  createApplication: (data) => api.post("/applications", data),
  getMyApplications: () => api.get("/applications/my-applications"),
  getOpportunityApplications: (opportunityId) =>
    api.get(`/applications/opportunity/${opportunityId}`),
  respondApplication: (id, status) =>
    api.patch(`/applications/${id}/respond`, { status }),
};
