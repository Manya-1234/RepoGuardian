import React from "react";
import {
  Calendar,
  GitPullRequest,
  Trash2,
  Pencil,
  GripVertical,
} from "lucide-react";
import { Badge } from "../common/Badge";

export const TaskCard = ({
  task,
  onEdit,
  onDelete,
  canEdit = true,
}) => {
  const handleDragStart = (e) => {
    if (!canEdit) return;
    e.dataTransfer.setData("text/plain", task._id);
    e.dataTransfer.setData("sourceStatus", task.status);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      className={`bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 shadow-lg group transition ${
        canEdit ? "cursor-grab active:cursor-grabbing select-none" : ""
      }`}
    >
      {/* Top Header: Priority & Actions */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition shrink-0" />
          )}
          <Badge variant={task.priority} size="xs">
            {task.priority}
          </Badge>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={() => onEdit && onEdit(task)}
              className="p-1 text-slate-500 hover:text-indigo-400 transition rounded-lg hover:bg-slate-900"
              title="Edit task"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(task._id)}
              className="p-1 text-slate-500 hover:text-rose-400 transition rounded-lg hover:bg-slate-900"
              title="Delete task"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
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
        <div className="flex items-center gap-1.5 min-w-0">
          {task.assignedTo ? (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 min-w-0 max-w-[140px]"
              title={`Assigned to ${task.assignedTo.fullName || task.assignedTo.username} (@${task.assignedTo.username})`}
            >
              <img
                src={
                  task.assignedTo.avatar ||
                  `https://api.dicebear.com/7.x/identicon/svg?seed=${task.assignedTo.username}`
                }
                alt={task.assignedTo.username}
                className="w-4 h-4 rounded-full object-cover border border-slate-700 shrink-0"
              />
              <span className="truncate text-[10px] font-medium text-slate-300">
                {task.assignedTo.fullName || task.assignedTo.username}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 italic px-1.5 py-0.5 rounded bg-slate-900/50">
              Unassigned
            </span>
          )}
        </div>

        {task.dueDate && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Calendar className="w-3 h-3" />
            <span>{new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
          </div>
        )}
      </div>
    </div>
  );
};
