// Bookmarks to the original project catalogs used the project root plus a fragment.
const navigation = document.querySelector('[data-legacy-catalog-fragments]');
if (navigation) {
  const fragments = new Set(navigation.dataset.legacyCatalogFragments.split(' '));
  function followCatalogBookmark() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); }
    catch { return; }
    if (id && fragments.has(id) && !document.getElementById(id)) {
      location.replace(navigation.dataset.catalogUrl + location.search + location.hash);
    }
  }
  followCatalogBookmark();
  window.addEventListener('hashchange', followCatalogBookmark);
}
