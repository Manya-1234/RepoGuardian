import api from "./axios";

export const githubApi = {
  linkRepo: (projectId, githubUrl) =>
    api.post(`/github/workspace/${projectId}/link`, { githubUrl }),
  unlinkRepo: (projectId) =>
    api.delete(`/github/workspace/${projectId}/unlink`),
  getRepoOverview: (projectId) =>
    api.get(`/github/workspace/${projectId}/overview`),
  getBranches: (projectId) =>
    api.get(`/github/workspace/${projectId}/branches`),
  getCommits: (projectId, branch) =>
    api.get(`/github/workspace/${projectId}/commits`, { params: { branch } }),
  getPulls: (projectId, state = "all") =>
    api.get(`/github/workspace/${projectId}/pulls`, { params: { state } }),
  getTree: (projectId, branch) =>
    api.get(`/github/workspace/${projectId}/tree`, { params: { branch } }),
  getFileContent: (projectId, path, branch) =>
    api.get(`/github/workspace/${projectId}/file-content`, {
      params: { path, branch },
    }),
};
