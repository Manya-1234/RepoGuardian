import api from "./axios";

export const taskApi = {
  createTask: (data) => {
    const workspaceId = data?.workspace || data?.workspaceId || data?.projectId;
    if (workspaceId) {
      return api.post(`/tasks/workspace/${workspaceId}`, data);
    }
    return api.post("/tasks", data);
  },
  getTasks: (params = {}) => {
    if (params.workspaceId) {
      return api.get(`/tasks/workspace/${params.workspaceId}`, { params });
    }
    return api.get("/tasks", { params });
  },
  getTaskById: (id) => api.get(`/tasks/${id}`),
  updateTask: (id, data) => api.patch(`/tasks/${id}`, data),
  updateTaskStatus: (id, status) => api.patch(`/tasks/${id}/status`, { status }),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
};
