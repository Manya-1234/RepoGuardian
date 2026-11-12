import api from "./axios";

export const projectApi = {
  createProject: (data) => api.post("/projects", data),
  getMyProjects: () => api.get("/projects/my-projects"),
  getProjectById: (id) => api.get(`/projects/${id}`),
  updateProject: (id, data) => api.patch(`/projects/${id}`, data),
  deleteProject: (id) => api.delete(`/projects/${id}`),
  inviteMember: (id, data) => api.post(`/projects/${id}/invitations`, data),
  getMyInvitations: () => api.get("/projects/invitations/my"),
  respondInvitation: (invitationId, action) =>
    api.patch(`/projects/invitations/${invitationId}/respond`, { action }),
  removeMember: (projectId, userId) =>
    api.delete(`/projects/${projectId}/members/${userId}`),
};
