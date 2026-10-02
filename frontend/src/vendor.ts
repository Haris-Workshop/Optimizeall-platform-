/**
 * The libraries the app starts with, loaded (and evaluated) as a step of their own by src/main.tsx before the app
 * itself: the browser gets a break between the two instead of one long task.
 */
import '@tanstack/react-query';
import 'react';
import 'react-dom/client';
import 'react-router-dom';
