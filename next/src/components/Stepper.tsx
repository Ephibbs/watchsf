import { motion, AnimatePresence } from "framer-motion";

interface Step {
  title: string;
  description: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
}

interface StepperProps {
  steps: Step[];
  visible: boolean;
}

export default function Stepper({ steps, visible }: StepperProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="w-full rounded-lg shadow-lg"
        >
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-6 border border-gray-200">
            <div className="flex justify-between items-start gap-4">
              {steps.map((step, index) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="flex-1 relative"
                >
                  {/* Connection line */}
                  {index < steps.length - 1 && (
                    <div className={`absolute top-4 left-[calc(50%+1rem)] right-0 h-[2px] 
                      ${step.status === 'completed' ? 'bg-green-500' : 
                        step.status === 'processing' ? 'bg-blue-500' : 
                        step.status === 'error' ? 'bg-red-500' : 'bg-gray-200'}`}
                    />
                  )}
                  
                  <div className="flex flex-col items-center text-center">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center mb-2
                      ${step.status === 'completed' ? 'bg-green-500' : 
                        step.status === 'processing' ? 'bg-blue-500 animate-pulse' : 
                        step.status === 'error' ? 'bg-red-500' : 'bg-gray-200'}
                      text-white relative z-10
                    `}>
                      {step.status === 'completed' ? '✓' : index + 1}
                    </div>
                    <h3 className="font-medium text-gray-900 text-sm">{step.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 