import api from "./axios";

export const taskApi = {
  createTask: (data) => api.post("/tasks", data),
  getTasks: (params = {}) => api.get("/tasks", { params }),
  getTaskById: (id) => api.get(`/tasks/${id}`),
  updateTask: (id, data) => api.patch(`/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
};
