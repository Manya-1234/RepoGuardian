import api from "./axios";

export const authApi = {
  register: (data) => api.post("/users/register", data),
  login: (data) => api.post("/users/login", data),
  logout: () => api.post("/users/logout"),
  getCurrentUser: () => api.get("/users/current-user"),
  refreshToken: () => api.post("/users/refresh-token"),
  changePassword: (data) => api.post("/users/change-password", data),
};
