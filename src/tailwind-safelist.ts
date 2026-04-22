// src/tailwind-safelist.ts

export const TAILWIND_SAFELIST = `
/* Layout */
flex inline-flex grid inline-grid block inline-block hidden
flex-row flex-col flex-wrap flex-nowrap
flex-1 flex-auto flex-none shrink-0 grow
items-start items-center items-end items-stretch items-baseline
justify-start justify-center justify-between justify-end justify-around justify-evenly
self-start self-center self-end self-stretch
gap-0 gap-0.5 gap-1 gap-1.5 gap-2 gap-2.5 gap-3 gap-3.5 gap-4 gap-5 gap-6 gap-7 gap-8 gap-9 gap-10 gap-12 gap-14 gap-16
gap-x-1 gap-x-2 gap-x-3 gap-x-4 gap-x-6 gap-x-8
gap-y-1 gap-y-2 gap-y-3 gap-y-4 gap-y-6 gap-y-8
grid-cols-1 grid-cols-2 grid-cols-3 grid-cols-4 grid-cols-5 grid-cols-6
col-span-1 col-span-2 col-span-3 col-span-4 col-span-full
row-span-1 row-span-2 row-span-3

/* Spacing */
p-0 p-0.5 p-1 p-1.5 p-2 p-2.5 p-3 p-3.5 p-4 p-5 p-6 p-7 p-8 p-9 p-10 p-12 p-14 p-16
px-0 px-0.5 px-1 px-1.5 px-2 px-2.5 px-3 px-3.5 px-4 px-5 px-6 px-7 px-8 px-9 px-10 px-12 px-14 px-16
py-0 py-0.5 py-1 py-1.5 py-2 py-2.5 py-3 py-3.5 py-4 py-5 py-6 py-7 py-8 py-9 py-10 py-12 py-14 py-16
pt-0 pt-1 pt-2 pt-3 pt-4 pt-5 pt-6 pt-8 pt-10 pt-12
pb-0 pb-1 pb-2 pb-3 pb-4 pb-5 pb-6 pb-8 pb-10 pb-12
pl-0 pl-1 pl-2 pl-3 pl-4 pl-5 pl-6 pl-8 pl-10
pr-0 pr-1 pr-2 pr-3 pr-4 pr-5 pr-6 pr-8 pr-10
m-0 m-0.5 m-1 m-1.5 m-2 m-2.5 m-3 m-4 m-5 m-6 m-8 m-10 m-auto
mx-0 mx-1 mx-2 mx-3 mx-4 mx-5 mx-6 mx-8 mx-auto
my-0 my-1 my-2 my-3 my-4 my-5 my-6 my-8 my-auto
mt-0 mt-0.5 mt-1 mt-1.5 mt-2 mt-2.5 mt-3 mt-4 mt-5 mt-6 mt-7 mt-8 mt-10 mt-12 mt-auto
mb-0 mb-0.5 mb-1 mb-1.5 mb-2 mb-2.5 mb-3 mb-4 mb-5 mb-6 mb-7 mb-8 mb-10 mb-12 mb-auto
ml-0 ml-1 ml-2 ml-3 ml-4 ml-5 ml-6 ml-8 ml-auto
mr-0 mr-1 mr-2 mr-3 mr-4 mr-5 mr-6 mr-8 mr-auto
space-x-1 space-x-2 space-x-3 space-x-4 space-x-6 space-x-8
space-y-1 space-y-2 space-y-3 space-y-4 space-y-6 space-y-8

/* Sizing */
w-0 w-px w-1 w-2 w-3 w-4 w-5 w-6 w-7 w-8 w-9 w-10 w-11 w-12 w-14 w-16 w-20 w-24 w-28 w-32 w-36 w-40 w-48 w-56 w-64 w-72 w-80 w-96
w-auto w-full w-screen w-fit w-min w-max
w-1/2 w-1/3 w-2/3 w-1/4 w-3/4
h-0 h-px h-1 h-2 h-3 h-4 h-5 h-6 h-7 h-8 h-9 h-10 h-11 h-12 h-14 h-16 h-20 h-24 h-28 h-32 h-36 h-40 h-48 h-56 h-64 h-72 h-80 h-96
h-auto h-full h-screen h-fit h-min h-max
min-w-0 min-w-full min-w-fit
min-h-0 min-h-full min-h-screen
max-w-none max-w-xs max-w-sm max-w-md max-w-lg max-w-xl max-w-2xl max-w-3xl max-w-4xl max-w-5xl max-w-6xl max-w-full max-w-fit
max-h-24 max-h-32 max-h-40 max-h-48 max-h-56 max-h-64 max-h-80 max-h-96 max-h-full max-h-screen

w-0.5 w-1.5 w-2.5 w-3.5
h-0.5 h-1.5 h-2.5 h-3.5
size-0.5 size-1.5 size-2.5 size-3.5

/* Typography */
text-xs text-sm text-base text-lg text-xl text-2xl text-3xl text-4xl text-5xl
font-thin font-extralight font-light font-normal font-medium font-semibold font-bold font-extrabold font-black
italic not-italic
leading-none leading-tight leading-snug leading-normal leading-relaxed leading-loose
tracking-tighter tracking-tight tracking-normal tracking-wide tracking-wider tracking-widest
text-left text-center text-right text-justify
underline no-underline line-through
uppercase lowercase capitalize normal-case
truncate text-ellipsis whitespace-nowrap whitespace-normal whitespace-pre whitespace-pre-wrap whitespace-pre-line
break-normal break-words break-all
list-none list-disc list-decimal

/* Slate */
text-slate-50 text-slate-100 text-slate-200 text-slate-300 text-slate-400 text-slate-500 text-slate-600 text-slate-700 text-slate-800 text-slate-900 text-slate-950
bg-slate-50 bg-slate-100 bg-slate-200 bg-slate-300 bg-slate-400 bg-slate-500 bg-slate-600 bg-slate-700 bg-slate-800 bg-slate-900 bg-slate-950
border-slate-100 border-slate-200 border-slate-300 border-slate-400 border-slate-500 border-slate-600 border-slate-700 border-slate-800

/* Gray */
text-gray-50 text-gray-100 text-gray-200 text-gray-300 text-gray-400 text-gray-500 text-gray-600 text-gray-700 text-gray-800 text-gray-900 text-gray-950
bg-gray-50 bg-gray-100 bg-gray-200 bg-gray-300 bg-gray-400 bg-gray-500 bg-gray-600 bg-gray-700 bg-gray-800 bg-gray-900 bg-gray-950
border-gray-100 border-gray-200 border-gray-300 border-gray-400 border-gray-500

/* Zinc */
text-zinc-50 text-zinc-100 text-zinc-200 text-zinc-300 text-zinc-400 text-zinc-500 text-zinc-600 text-zinc-700 text-zinc-800 text-zinc-900 text-zinc-950
bg-zinc-50 bg-zinc-100 bg-zinc-200 bg-zinc-300 bg-zinc-400 bg-zinc-500 bg-zinc-600 bg-zinc-700 bg-zinc-800 bg-zinc-900 bg-zinc-950
border-zinc-100 border-zinc-200 border-zinc-300 border-zinc-400 border-zinc-500

/* Neutral */
text-neutral-50 text-neutral-100 text-neutral-200 text-neutral-300 text-neutral-400 text-neutral-500 text-neutral-600 text-neutral-700 text-neutral-800 text-neutral-900 text-neutral-950
bg-neutral-50 bg-neutral-100 bg-neutral-200 bg-neutral-300 bg-neutral-400 bg-neutral-500 bg-neutral-600 bg-neutral-700 bg-neutral-800 bg-neutral-900 bg-neutral-950
border-neutral-100 border-neutral-200 border-neutral-300 border-neutral-400 border-neutral-500

/* White / Black */
text-white text-black
bg-white bg-black bg-transparent
border-white border-black

/* Blue */
text-blue-50 text-blue-100 text-blue-200 text-blue-300 text-blue-400 text-blue-500 text-blue-600 text-blue-700 text-blue-800 text-blue-900
bg-blue-50 bg-blue-100 bg-blue-200 bg-blue-300 bg-blue-400 bg-blue-500 bg-blue-600 bg-blue-700 bg-blue-800 bg-blue-900
border-blue-200 border-blue-300 border-blue-400 border-blue-500 border-blue-600

/* Indigo */
text-indigo-50 text-indigo-100 text-indigo-200 text-indigo-300 text-indigo-400 text-indigo-500 text-indigo-600 text-indigo-700 text-indigo-800 text-indigo-900
bg-indigo-50 bg-indigo-100 bg-indigo-200 bg-indigo-300 bg-indigo-400 bg-indigo-500 bg-indigo-600 bg-indigo-700 bg-indigo-800 bg-indigo-900
border-indigo-200 border-indigo-300 border-indigo-400 border-indigo-500 border-indigo-600

/* Violet / Purple */
text-violet-500 text-violet-600 text-violet-700 text-violet-800
bg-violet-50 bg-violet-100 bg-violet-500 bg-violet-600 bg-violet-700
border-violet-200 border-violet-300 border-violet-500
text-purple-500 text-purple-600 text-purple-700 text-purple-800
bg-purple-50 bg-purple-100 bg-purple-500 bg-purple-600 bg-purple-700
border-purple-200 border-purple-300 border-purple-500

/* Green / Emerald */
text-green-500 text-green-600 text-green-700 text-green-800
bg-green-50 bg-green-100 bg-green-500 bg-green-600 bg-green-700
border-green-200 border-green-300 border-green-500
text-emerald-500 text-emerald-600 text-emerald-700 text-emerald-800
bg-emerald-50 bg-emerald-100 bg-emerald-500 bg-emerald-600 bg-emerald-700
border-emerald-200 border-emerald-300 border-emerald-500

/* Yellow / Amber */
text-yellow-500 text-yellow-600 text-yellow-700 text-yellow-800
bg-yellow-50 bg-yellow-100 bg-yellow-400 bg-yellow-500
border-yellow-200 border-yellow-300 border-yellow-400
text-amber-500 text-amber-600 text-amber-700 text-amber-800
bg-amber-50 bg-amber-100 bg-amber-400 bg-amber-500
border-amber-200 border-amber-300 border-amber-400

/* Orange */
text-orange-500 text-orange-600 text-orange-700 text-orange-800
bg-orange-50 bg-orange-100 bg-orange-500 bg-orange-600
border-orange-200 border-orange-300 border-orange-500

/* Red / Rose */
text-red-400 text-red-500 text-red-600 text-red-700 text-red-800
bg-red-50 bg-red-100 bg-red-500 bg-red-600
border-red-200 border-red-300 border-red-400 border-red-500
text-rose-400 text-rose-500 text-rose-600 text-rose-700
bg-rose-50 bg-rose-100 bg-rose-500 bg-rose-600
border-rose-200 border-rose-300 border-rose-500

/* Pink */
text-pink-400 text-pink-500 text-pink-600 text-pink-700
bg-pink-50 bg-pink-100 bg-pink-500 bg-pink-600
border-pink-200 border-pink-300 border-pink-500

/* Teal / Cyan / Sky */
text-teal-500 text-teal-600 text-teal-700
bg-teal-50 bg-teal-100 bg-teal-500 bg-teal-600
border-teal-200 border-teal-300 border-teal-500
text-cyan-500 text-cyan-600 text-cyan-700
bg-cyan-50 bg-cyan-100 bg-cyan-500 bg-cyan-600
border-cyan-200 border-cyan-300 border-cyan-500
text-sky-500 text-sky-600 text-sky-700
bg-sky-50 bg-sky-100 bg-sky-500 bg-sky-600
border-sky-200 border-sky-300 border-sky-500

/* shadcn semantic tokens */
bg-background bg-foreground
bg-primary bg-primary-foreground
bg-secondary bg-secondary-foreground
bg-muted bg-muted-foreground
bg-accent bg-accent-foreground
bg-destructive bg-destructive-foreground
bg-card bg-card-foreground
bg-popover bg-popover-foreground
text-background text-foreground
text-primary text-primary-foreground
text-secondary text-secondary-foreground
text-muted text-muted-foreground
text-accent text-accent-foreground
text-destructive text-destructive-foreground
text-card-foreground text-popover-foreground
border-border border-input border-ring
border-primary border-secondary border-muted border-accent border-destructive

/* Borders */
border border-0 border-2 border-4 border-8
border-t border-t-0 border-t-2
border-b border-b-0 border-b-2
border-l border-l-0 border-l-2
border-r border-r-0 border-r-2
rounded-none rounded-sm rounded rounded-md rounded-lg rounded-xl rounded-2xl rounded-3xl rounded-full
divide-y divide-x divide-slate-100 divide-slate-200 divide-gray-100 divide-gray-200

/* Effects */
shadow-none shadow-sm shadow shadow-md shadow-lg shadow-xl shadow-2xl shadow-inner
ring-0 ring-1 ring-2 ring-4 ring-inset
ring-slate-200 ring-slate-300 ring-blue-500 ring-indigo-500
opacity-0 opacity-25 opacity-50 opacity-75 opacity-90 opacity-95 opacity-100
blur-none blur-sm blur blur-md blur-lg
backdrop-blur-none backdrop-blur-sm backdrop-blur backdrop-blur-md backdrop-blur-lg

/* Transitions / Animation */
transition transition-all transition-colors transition-opacity transition-transform transition-shadow
duration-75 duration-100 duration-150 duration-200 duration-300 duration-500
ease-in ease-out ease-in-out
animate-spin animate-ping animate-pulse animate-bounce

/* Hover / Focus / Active states */
hover:bg-slate-50 hover:bg-slate-100 hover:bg-slate-200
hover:bg-gray-50 hover:bg-gray-100 hover:bg-gray-200
hover:bg-zinc-50 hover:bg-zinc-100
hover:bg-neutral-50 hover:bg-neutral-100
hover:bg-blue-50 hover:bg-blue-100 hover:bg-blue-600 hover:bg-blue-700
hover:bg-indigo-50 hover:bg-indigo-100 hover:bg-indigo-600 hover:bg-indigo-700
hover:bg-white
hover:text-slate-700 hover:text-slate-800 hover:text-slate-900
hover:text-gray-700 hover:text-gray-800 hover:text-gray-900
hover:text-blue-600 hover:text-blue-700 hover:text-indigo-600 hover:text-indigo-700
hover:text-white
hover:border-slate-300 hover:border-blue-400 hover:border-indigo-400
hover:shadow-md hover:shadow-lg
hover:underline hover:no-underline
hover:opacity-80 hover:opacity-90
hover:scale-105 hover:scale-110
focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-indigo-500 focus:ring-offset-2
focus:border-blue-500 focus:border-indigo-500
active:scale-95 active:opacity-90
group hover:bg-slate-50
group-hover:text-blue-600 group-hover:text-indigo-600 group-hover:text-slate-900
group-hover:opacity-100 group-hover:underline group-hover:scale-105

/* Interaction */
cursor-pointer cursor-default cursor-not-allowed cursor-wait cursor-text cursor-grab
select-none select-text select-all
pointer-events-none pointer-events-auto

/* Overflow */
overflow-hidden overflow-auto overflow-visible overflow-scroll
overflow-y-auto overflow-y-hidden overflow-y-scroll
overflow-x-auto overflow-x-hidden overflow-x-scroll

/* Position */
relative absolute fixed sticky
inset-0 inset-x-0 inset-y-0
top-0 top-1 top-2 top-4 top-full
bottom-0 bottom-1 bottom-2 bottom-4 bottom-full
left-0 left-1 left-2 left-4 left-full
right-0 right-1 right-2 right-4 right-full

/* Z-index */
z-0 z-10 z-20 z-30 z-40 z-50 z-auto

/* Object fit */
object-contain object-cover object-fill object-none object-center object-top object-bottom

/* Aspect ratio */
aspect-auto aspect-square aspect-video

/* Display / Visibility */
visible invisible
sr-only not-sr-only

/* Misc */
appearance-none
outline-none outline
resize-none resize
table-auto table-fixed
border-collapse border-separate
`;