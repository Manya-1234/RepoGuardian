import api from "./axios";

export const chatApi = {
  getConversations: () => api.get("/chat/conversations"),
  getDirectChat: (recipientId) => api.post(`/chat/direct/${recipientId}`),
  getWorkspaceChat: (workspaceId) => api.get(`/chat/workspace/${workspaceId}`),
  getMessages: (conversationId, params = {}) =>
    api.get(`/chat/${conversationId}/messages`, { params }),
};
