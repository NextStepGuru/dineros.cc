<template lang="pug">
  .flex.items-center.gap-2
    NuxtImg(
      src="https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png"
      width="28"
      height="28"
      sizes="28px"
      preload
      fetchpriority="high"
      alt="Dineros logo"
      class="size-7 rounded-full ring-2 frog-logo-ring")
    .leading-tight
      span(class="text-lg font-bold tracking-tight") Dineros
      p(class="text-[11px] frog-text-muted -mt-1") Predictive budgeting
</template>
