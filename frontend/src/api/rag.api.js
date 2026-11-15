import api from "./axios";

export const ragApi = {
  triggerIndexing: (repositoryId, data = {}) =>
    api.post(`/repositories/${repositoryId}/index`, data),
  getIndexingStatus: (repositoryId, branch) =>
    api.get(`/repositories/${repositoryId}/index/status`, {
      params: { branch },
    }),
  askRepository: (repositoryId, data) =>
    api.post(`/repositories/${repositoryId}/chat`, data),
  searchCode: (repositoryId, params) =>
    api.get(`/repositories/${repositoryId}/search`, { params }),
};
