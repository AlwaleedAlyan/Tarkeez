import type { Session, StudyData } from "./calendarUtils";

export const studyData: StudyData = {
  "2026-07-01": 0,
  "2026-07-02": 30,
  "2026-07-03": 90,
  "2026-07-04": 120,
  "2026-07-05": 45,
  "2026-07-06": 0,
  "2026-07-07": 60,
  "2026-07-08": 150,
  "2026-07-09": 80,
  "2026-07-10": 0,
  "2026-07-11": 180,
  "2026-07-12": 120,
  "2026-07-13": 90,
  "2026-07-14": 0,
  "2026-07-15": 60,
  "2026-07-16": 200,
  "2026-07-17": 150,
  "2026-07-18": 0,
  "2026-07-19": 45,
  "2026-07-20": 120,
  "2026-07-21": 90,
  "2026-07-22": 0,
  "2026-07-23": 30,
  "2026-07-24": 180,
  "2026-07-25": 210,
  "2026-07-26": 60,
  "2026-07-27": 0,
  "2026-07-28": 120,
  "2026-07-29": 90,
  "2026-07-30": 150,
  "2026-07-31": 45,
};

export const sessionsForJuly8: Session[] = [
  {
    id: "1",
    title: "Machine Learning Notes",
    topic: "notes",
    startTime: "09:00",
    duration: 45,
    pagesRead: 12,
    focusScore: 95,
    date: "2026-07-08",
  },
  {
    id: "2",
    title: "Statistics Problem Set",
    topic: "math",
    startTime: "11:30",
    duration: 80,
    pagesRead: 8,
    focusScore: 88,
    date: "2026-07-08",
  },
  {
    id: "3",
    title: "Research Paper Review",
    topic: "reading",
    startTime: "15:00",
    duration: 30,
    focusScore: 92,
    date: "2026-07-08",
  },
  {
    id: "4",
    title: "Programming Assignment",
    topic: "coding",
    startTime: "17:00",
    duration: 15,
    focusScore: 100,
    date: "2026-07-08",
  },
];

export const currentStreak = 12;
export const bestStreak = 28;

// Last 7 days in minutes (mock as of ~July 2026)
export const weeklyActivity = [60, 90, 0, 120, 150, 210, 180];
