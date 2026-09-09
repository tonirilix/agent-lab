export type Task = {
  id: string;
  title: string;
  completed: boolean;
};

export function addTask(tasks: Task[], task: Task): Task[] {
  return [...tasks, task];
}

export function completeTask(tasks: Task[], taskId: string): Task[] {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, completed: true } : task,
  );
}
