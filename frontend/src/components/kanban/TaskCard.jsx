import React from "react";
import {
  Calendar,
  GitPullRequest,
  ChevronLeft,
  ChevronRight,
  Trash2,
  User,
} from "lucide-react";
import { Badge } from "../common/Badge";

export const TaskCard = ({
  task,
  onStatusChange,
  onDelete,
  canEdit = true,
}) => {
  const statusFlow = ["todo", "in_progress", "in_review", "done"];
  const currentIndex = statusFlow.indexOf(task.status);

  const prevStatus = currentIndex > 0 ? statusFlow[currentIndex - 1] : null;
  const nextStatus =
    currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;

  return (
    <div className="bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 shadow-lg group transition">
      {/* Top Header: Priority & Delete */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge variant={task.priority} size="xs">
          {task.priority}
        </Badge>

        {canEdit && (
          <button
            onClick={() => onDelete(task._id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition"
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Title & Description */}
      <h4 className="text-xs sm:text-sm font-semibold text-slate-100 mb-1 leading-snug">
        {task.title}
      </h4>
      {task.description && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-3">
          {task.description}
        </p>
      )}

      {/* GitHub Link if attached */}
      {task.github?.url && (
        <a
          href={task.github.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300 hover:text-indigo-400 mb-3 transition"
        >
          <GitPullRequest className="w-3 h-3 text-indigo-400" />
          <span className="truncate max-w-[140px]">
            {task.github.title || "PR / Issue"}
          </span>
        </a>
      )}

      {/* Footer Info: Assignee & Due Date */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-900 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          {task.assignedTo ? (
            <img
              src={
                task.assignedTo.avatar ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${task.assignedTo.username}`
              }
              alt={task.assignedTo.username}
              title={`Assigned to ${task.assignedTo.fullName || task.assignedTo.username}`}
              className="w-5 h-5 rounded-full object-cover border border-slate-700"
            />
          ) : (
            <span className="text-[10px] text-slate-500">Unassigned</span>
          )}
        </div>

        {task.dueDate && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Calendar className="w-3 h-3" />
            <span>{new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
          </div>
        )}
      </div>

      {/* Move Buttons */}
      {canEdit && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-900">
          <button
            disabled={!prevStatus}
            onClick={() => onStatusChange(task._id, prevStatus)}
            className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-indigo-400 disabled:opacity-20 disabled:hover:text-slate-400 transition"
            title={`Move to ${prevStatus}`}
          >
            <ChevronLeft className="w-3 h-3" /> Back
          </button>

          <button
            disabled={!nextStatus}
            onClick={() => onStatusChange(task._id, nextStatus)}
            className="flex items-center gap-0.5 text-[10px] text-indigo-400 hover:text-indigo-300 disabled:opacity-20 disabled:hover:text-slate-400 transition font-medium"
            title={`Move to ${nextStatus}`}
          >
            Advance <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
