export type TaskType = 'gps' | 'quiz' | 'submission';

export type Task = {
  id: string;
  points: number;
  status: 'available' | 'completed' | 'in-review';
  title: string;
  type: TaskType;
};

export const mockTasks: Task[] = [
  {
    id: 'quiz-001',
    points: 40,
    status: 'available',
    title: 'Answer the emergency values quiz',
    type: 'quiz',
  },
  {
    id: 'gps-014',
    points: 25,
    status: 'available',
    title: 'Visit Checkpoint Theaterplatz',
    type: 'gps',
  },
  {
    id: 'submission-009',
    points: 30,
    status: 'in-review',
    title: 'Upload photo of today’s kindness mission',
    type: 'submission',
  },
];
