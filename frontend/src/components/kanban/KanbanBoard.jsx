import React, { useState, useEffect } from "react";
import { Plus, CheckCircle2, Clock, Eye, ListTodo } from "lucide-react";
import { taskApi } from "../../api/task.api";
import { TaskCard } from "./TaskCard";
import { CreateTaskModal } from "./CreateTaskModal";
import { EditTaskModal } from "./EditTaskModal";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { useSocket } from "../../context/SocketContext";

export const KanbanBoard = ({
  workspaceId,
  members = [],
  isMember = true,
  canManageTasks = false,
}) => {
  const [columns, setColumns] = useState({
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [draggedOverCol, setDraggedOverCol] = useState(null);
  const { socket } = useSocket();

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await taskApi.getTasks({
        workspaceId,
        groupBy: "status",
      });
      setColumns({
        todo: res.data?.todo || [],
        in_progress: res.data?.in_progress || [],
        in_review: res.data?.in_review || [],
        done: res.data?.done || [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchTasks();
    }
  }, [workspaceId]);

  // Live Socket.IO Task Events
  useEffect(() => {
    if (!socket || !workspaceId) return;

    socket.emit("join_workspace", workspaceId);

    const handleTaskCreated = (newTask) => {
      const taskWorkspaceId =
        newTask.workspace ||
        newTask.workspaceId ||
        newTask.projectId ||
        newTask.project?._id ||
        newTask.project;

      if (taskWorkspaceId?.toString() === workspaceId?.toString()) {
        setColumns((prev) => {
          const colTasks = prev[newTask.status] || [];
          if (colTasks.some((t) => t._id === newTask._id)) return prev;
          return {
            ...prev,
            [newTask.status]: [newTask, ...colTasks],
          };
        });
      }
    };

    const handleTaskUpdated = (updatedTask) => {
      const taskWorkspaceId =
        updatedTask.workspace ||
        updatedTask.workspaceId ||
        updatedTask.projectId ||
        updatedTask.project?._id ||
        updatedTask.project;

      if (taskWorkspaceId?.toString() === workspaceId?.toString()) {
        setColumns((prev) => {
          const nextCols = { ...prev };
          // Remove from old column
          Object.keys(nextCols).forEach((statusKey) => {
            nextCols[statusKey] = (nextCols[statusKey] || []).filter(
              (t) => t._id !== updatedTask._id
            );
          });
          // Add to new column
          nextCols[updatedTask.status] = [
            updatedTask,
            ...(nextCols[updatedTask.status] || []),
          ];
          return nextCols;
        });
      }
    };

    const handleTaskStatusUpdated = ({ taskId, newStatus, task: updatedTask }) => {
      if (updatedTask) {
        handleTaskUpdated(updatedTask);
      } else {
        setColumns((prev) => {
          let foundTask = null;
          const nextCols = { ...prev };
          Object.keys(nextCols).forEach((statusKey) => {
            const match = (nextCols[statusKey] || []).find((t) => t._id === taskId);
            if (match) {
              foundTask = { ...match, status: newStatus };
              nextCols[statusKey] = nextCols[statusKey].filter((t) => t._id !== taskId);
            }
          });
          if (foundTask && nextCols[newStatus]) {
            nextCols[newStatus] = [foundTask, ...nextCols[newStatus]];
          }
          return nextCols;
        });
      }
    };

    const handleTaskDeleted = ({ taskId }) => {
      setColumns((prev) => {
        const nextCols = { ...prev };
        Object.keys(nextCols).forEach((statusKey) => {
          nextCols[statusKey] = (nextCols[statusKey] || []).filter(
            (t) => t._id !== taskId
          );
        });
        return nextCols;
      });
    };

    socket.on("task_created", handleTaskCreated);
    socket.on("task_updated", handleTaskUpdated);
    socket.on("task_status_updated", handleTaskStatusUpdated);
    socket.on("task_deleted", handleTaskDeleted);

    return () => {
      socket.emit("leave_workspace", workspaceId);
      socket.off("task_created", handleTaskCreated);
      socket.off("task_updated", handleTaskUpdated);
      socket.off("task_status_updated", handleTaskStatusUpdated);
      socket.off("task_deleted", handleTaskDeleted);
    };
  }, [socket, workspaceId]);

  const handleDragOver = (e, colId) => {
    if (!canManageTasks) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedOverCol !== colId) {
      setDraggedOverCol(colId);
    }
  };

  const handleDragLeave = (e, colId) => {
    if (draggedOverCol === colId) {
      setDraggedOverCol(null);
    }
  };

  const handleDrop = (e, targetStatus) => {
    if (!canManageTasks) return;
    e.preventDefault();
    setDraggedOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain");
    const sourceStatus = e.dataTransfer.getData("sourceStatus");

    if (taskId && targetStatus && targetStatus !== sourceStatus) {
      handleStatusChange(taskId, targetStatus);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      // Optimistic update
      setColumns((prev) => {
        let taskToMove = null;
        const nextCols = { ...prev };
        Object.keys(nextCols).forEach((k) => {
          const found = nextCols[k].find((t) => t._id === taskId);
          if (found) {
            taskToMove = { ...found, status: newStatus };
            nextCols[k] = nextCols[k].filter((t) => t._id !== taskId);
          }
        });
        if (taskToMove) {
          nextCols[newStatus] = [taskToMove, ...(nextCols[newStatus] || [])];
        }
        return nextCols;
      });

      await taskApi.updateTask(taskId, { status: newStatus });
    } catch (err) {
      console.error(err);
      fetchTasks(); // Rollback on error
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      setColumns((prev) => {
        const nextCols = { ...prev };
        Object.keys(nextCols).forEach((k) => {
          nextCols[k] = nextCols[k].filter((t) => t._id !== taskId);
        });
        return nextCols;
      });
      await taskApi.deleteTask(taskId);
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  const columnConfig = [
    {
      id: "todo",
      name: "To Do",
      icon: ListTodo,
      color: "border-slate-700 bg-slate-900/50",
      accent: "text-slate-400",
    },
    {
      id: "in_progress",
      name: "In Progress",
      icon: Clock,
      color: "border-blue-900/50 bg-blue-950/20",
      accent: "text-blue-400",
    },
    {
      id: "in_review",
      name: "In Review",
      icon: Eye,
      color: "border-amber-900/50 bg-amber-950/20",
      accent: "text-amber-400",
    },
    {
      id: "done",
      name: "Done",
      icon: CheckCircle2,
      color: "border-emerald-900/50 bg-emerald-950/20",
      accent: "text-emerald-400",
    },
  ];

  return (
    <div>
      {/* Kanban Header Bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-100">Tasks & Roadmap</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Coordinate team milestones and linked GitHub pull requests
          </p>
        </div>

        {canManageTasks && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>Add Task</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {columnConfig.map((col) => {
            const Icon = col.icon;
            const tasks = columns[col.id] || [];

            const isOver = draggedOverCol === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={(e) => handleDragLeave(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`rounded-2xl border p-4 flex flex-col min-h-[500px] transition duration-150 ${
                  isOver
                    ? "border-indigo-500 bg-indigo-950/40 ring-2 ring-indigo-500/50"
                    : col.color
                }`}
              >
                {/* Column Title */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${col.accent}`} />
                    <span className="text-xs font-bold text-slate-200">
                      {col.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400">
                    {tasks.length}
                  </span>
                </div>

                {/* Tasks List */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {tasks.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-slate-400 border border-dashed border-slate-800/80 rounded-2xl h-full flex items-center justify-center">
                      {isOver ? "Drop task here" : "No tasks in this stage"}
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <TaskCard
                        key={task._id}
                        task={task}
                        onEdit={(t) => setEditingTask(t)}
                        onDelete={handleDeleteTask}
                        canEdit={canManageTasks}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceId={workspaceId}
        members={members}
        onTaskCreated={(newTask) => {
          if (!newTask || !newTask.status) return;
          setColumns((prev) => {
            const currentList = prev[newTask.status] || [];
            if (currentList.some((t) => t._id === newTask._id)) return prev;
            return {
              ...prev,
              [newTask.status]: [newTask, ...currentList],
            };
          });
        }}
      />

      {/* Edit Task Modal */}
      <EditTaskModal
        isOpen={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        task={editingTask}
        members={members}
        onTaskUpdated={(updatedTask) => {
          if (!updatedTask) return;
          // Optimistically update columns
          setColumns((prev) => {
            const nextCols = { ...prev };
            // Remove from existing status column
            Object.keys(nextCols).forEach((k) => {
              nextCols[k] = (nextCols[k] || []).filter((t) => t._id !== updatedTask._id);
            });
            // Add to updated status column
            nextCols[updatedTask.status] = [
              updatedTask,
              ...(nextCols[updatedTask.status] || []),
            ];
            return nextCols;
          });
        }}
      />
    </div>
  );
};
