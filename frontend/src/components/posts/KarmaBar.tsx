import { Button } from '@/components/ui/Button';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp } from 'lucide-react';

type KarmaBarProps = {
    karma: number;
    onUpvote: () => void;
    onDownvote: () => void;
};

export const KarmaBar = ({ karma, onUpvote, onDownvote }: KarmaBarProps) => {
    return (
        <div className="flex items-center space-x-2">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}>
                <Button variant="ghost" size="icon" onClick={onUpvote}>
                    <ArrowUp className="h-5 w-5" />
                </Button>
            </motion.div>
            <span className="font-semibold">{karma}</span>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}>
                <Button variant="ghost" size="icon" onClick={onDownvote}>
                    <ArrowDown className="h-5 w-5" />
                </Button>
            </motion.div>
        </div>
    );
};
