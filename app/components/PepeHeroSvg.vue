<template>
  <NuxtImg
    src="https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_640/v1737776329/pepe_solo_t0twqk.png"
    width="640"
    height="640"
    sizes="(max-width: 768px) 320px, 640px"
    loading="eager"
    alt="Pepe mascot for Dineros"
    class="pepe-img" />
</template>

<style scoped>
.pepe-img {
  display: block;
  width: min(100%, 21rem);
  height: auto;
  max-width: 21rem;
  border-radius: 1rem;
  filter: drop-shadow(0 20px 34px rgba(0, 0, 0, 0.35));
}
</style>
