"use client";

import { ArrowRight } from "lucide-react";
import { motion, type Variants } from "framer-motion";

type HouseType = {
  heading: string;
  description: string;
  imgSrc: string;
};

const houseTypes: HouseType[] = [
  {
    heading: "Modern",
    description: "Clean lines, open planning, and large glass openings for a sharper residential profile.",
    imgSrc: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    heading: "Contemporary",
    description: "Flexible forms, mixed materials, and bright shared spaces for current family living.",
    imgSrc: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    heading: "Praise",
    description: "Warm frontage, balanced details, and a welcoming plan suited for calm daily routines.",
    imgSrc: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80",
  },
  {
    heading: "Ranch",
    description: "Single-level convenience with wide horizontal massing and simple site access.",
    imgSrc: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80",
  },
  {
    heading: "Tudor",
    description: "Steep rooflines, expressive trim, and a more traditional exterior character.",
    imgSrc: "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    heading: "Victorian",
    description: "Decorative elevations, taller proportions, and classic details with strong curb presence.",
    imgSrc: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80",
  },
];

export default function ColorChangeCards() {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {houseTypes.map((houseType) => (
        <Card key={houseType.heading} {...houseType} />
      ))}
    </div>
  );
}

function Card({ heading, description, imgSrc }: HouseType) {
  return (
    <motion.button
      type="button"
      transition={{ staggerChildren: 0.035 }}
      whileHover="hover"
      whileFocus="hover"
      className="group relative h-72 w-full cursor-pointer overflow-hidden rounded-xl bg-stone-300 text-left ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-red-600 xl:h-[420px]"
      aria-label={`Choose ${heading} house type`}
    >
      <div
        className="absolute inset-0 saturate-100 transition-all duration-500 group-hover:scale-110 md:saturate-75 md:group-hover:saturate-100"
        style={{
          backgroundImage: `url(${imgSrc})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/20 to-transparent" />
      <div className="relative z-20 flex h-full flex-col justify-between p-4 text-white">
        <ArrowRight className="ml-auto h-7 w-7 transition-transform duration-500 group-hover:-rotate-45" />
        <div>
          <h3 className="leading-none">
            {heading.split("").map((letter, index) => (
              <AnimatedLetter letter={letter} key={`${letter}-${index}`} />
            ))}
          </h3>
          <p className="mt-3 text-sm leading-5 text-white/85">{description}</p>
        </div>
      </div>
    </motion.button>
  );
}

const letterVariants: Variants = {
  hover: {
    y: "-50%",
  },
};

function AnimatedLetter({ letter }: { letter: string }) {
  return (
    <span className="inline-block h-9 overflow-hidden text-3xl font-semibold tracking-tight">
      <motion.span
        className="flex min-w-1 flex-col"
        style={{ y: "0%" }}
        variants={letterVariants}
        transition={{ duration: 0.5 }}
      >
        <span>{letter}</span>
        <span>{letter}</span>
      </motion.span>
    </span>
  );
}
