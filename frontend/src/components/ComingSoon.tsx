import { motion } from 'framer-motion'
export default function ComingSoon({title}:{title:string}) {
  return (
    <motion.div className="card p-10 text-center" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-neutral-500">UI scaffolding in place. Hook up data next.</p>
    </motion.div>
  )
}
