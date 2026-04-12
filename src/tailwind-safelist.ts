// src/tailwind-safelist.ts

export const TAILWIND_SAFELIST = `
/* Layout */
flex inline-flex grid block hidden
items-start items-center items-end
justify-start justify-center justify-between justify-end
gap-0 gap-1 gap-2 gap-3 gap-4 gap-5 gap-6 gap-8 gap-10

/* Spacing */
p-0 p-1 p-2 p-3 p-4 p-5 p-6 p-8 p-10
px-0 px-1 px-2 px-3 px-4 px-5 px-6 px-8 px-10
py-0 py-1 py-2 py-3 py-4 py-5 py-6 py-8
m-0 m-1 m-2 m-3 m-4 m-5 m-6 m-8
mt-0 mt-1 mt-2 mt-3 mt-4 mt-5 mt-6 mt-8
mb-0 mb-1 mb-2 mb-3 mb-4 mb-5 mb-6 mb-8

/* Sizing */
w-full w-auto h-full h-auto
max-w-sm max-w-md max-w-lg max-w-xl
min-w-0 min-h-0

/* Typography */
text-xs text-sm text-base text-lg text-xl text-2xl
font-normal font-medium font-semibold font-bold
text-left text-center text-right
truncate

/* Colors (shadcn tokens) */
bg-background bg-foreground
bg-primary bg-secondary bg-muted bg-accent bg-destructive
text-background text-foreground
text-primary text-secondary text-muted-foreground text-accent-foreground
text-destructive
border-border border-primary border-muted

/* Borders */
border border-0 border-2
rounded-none rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-full

/* Effects */
shadow-sm shadow shadow-md shadow-lg
ring-0 ring-1 ring-2
opacity-0 opacity-50 opacity-75 opacity-100

/* Interaction */
cursor-pointer cursor-default
select-none

/* Overflow */
overflow-hidden overflow-auto overflow-y-auto overflow-x-auto

/* Position */
relative absolute fixed
top-0 bottom-0 left-0 right-0

/* Z-index */
z-0 z-10 z-20 z-30 z-40 z-50

/* Misc */
whitespace-nowrap whitespace-pre-wrap
`;
