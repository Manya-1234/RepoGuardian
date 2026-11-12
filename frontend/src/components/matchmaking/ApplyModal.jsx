import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, CheckCircle2, MessageSquare } from "lucide-react";
import { Modal } from "../common/Modal";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { applicationApi } from "../../api/application.api";

export const ApplyModal = ({ isOpen, onClose, opportunity, onSuccess }) => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!opportunity) return;
    setLoading(true);
    setError("");

    try {
      await applicationApi.createApplication({
        opportunityId: opportunity._id,
        type: "join_request",
        message: message.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setMessage("");
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || "Failed to submit application");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Apply for ${opportunity?.title || "Role"}`}
    >
      {success ? (
        <div className="py-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-100">
            Application Submitted!
          </h4>
          <p className="text-xs text-slate-400">
            The project team has been notified.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
            <p className="font-semibold text-indigo-400">
              {opportunity?.workspace?.name || "Workspace Opportunity"}
            </p>
            <p className="text-slate-400 mt-1 line-clamp-2">
              {opportunity?.description}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Pitch / Introductory Note (Optional)
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Why are you interested in this project? What relevant skills or experience can you contribute?"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {opportunity?.creator && (
            <div className="flex items-center justify-between text-xs text-slate-400 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span>Have questions before applying?</span>
              <button
                type="button"
                onClick={() => {
                  const creatorId =
                    (opportunity.creator?._id || opportunity.creator)?.toString();
                  if (creatorId) {
                    onClose();
                    navigate(`/messages?user=${creatorId}`);
                  }
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat with Owner</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {loading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
