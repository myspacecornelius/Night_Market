import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'

export default function Home() {
  return (
    <section className="container-narrow">
      <div className="card p-8 md:p-12">
        <motion.h1
          className="text-3xl md:text-5xl font-bold tracking-tight"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          Depth over dopamine.
        </motion.h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-300">
          A focused, minimalist surface with room for the ideas to breathe.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <NavLink to="/laces" className="btn btn-primary">Explore Laces</NavLink>
          <NavLink to="/heatmap" className="btn btn-ghost">Heatmap</NavLink>
          <NavLink to="/thriftroute" className="btn btn-ghost">ThriftRoute</NavLink>
        </div>
      </div>
    </section>
  )
}
