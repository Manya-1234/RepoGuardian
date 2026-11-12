import api from "./axios";

export const userApi = {
  updateProfile: (data) => api.patch("/users/profile", data),
  getProfile: (username) => api.get(`/users/profile/${username}`),
  getAllDevelopers: (params = {}) => api.get("/users/developers", { params }),
};
