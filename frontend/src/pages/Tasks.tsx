import React from 'react';
import { motion } from 'framer-motion';
import { ListChecks } from 'lucide-react';

const Tasks = () => {
  return (
    <motion.div
      className="space-y-8 p-6 min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="flex items-center justify-between"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white">Checkout Tasks</h1>
        <div className="flex items-center gap-2">
          <ListChecks className="w-8 h-8 text-gray-500" />
          <span className="text-lg font-semibold">Your Task History</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="text-center py-20">
          <h2 className="text-2xl font-semibold">Task History Coming Soon</h2>
          <p className="text-gray-500 mt-2">This is where you'll see the status and results of your checkout tasks.</p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Tasks;
