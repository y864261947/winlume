(() => {
  const sheet = document.getElementById('blue-palette');
  const brandSheet = document.getElementById('brand-palette');
  const morandiSheet = document.getElementById('morandi-palette');
  const khakiSheet = document.getElementById('khaki-palette');
  const navySheet = document.getElementById('navy-palette');
  const choices = document.querySelectorAll('[data-palette-choice]');
  function selectPalette(palette) {
    const selected = ['green', 'blue', 'brand', 'morandi', 'khaki', 'navy'].includes(palette) ? palette : 'green';
    sheet.media = selected === 'blue' ? 'all' : 'not all';
    brandSheet.media = selected === 'brand' ? 'all' : 'not all';
    morandiSheet.media = selected === 'morandi' ? 'all' : 'not all';
    khakiSheet.media = selected === 'khaki' ? 'all' : 'not all';
    navySheet.media = selected === 'navy' ? 'all' : 'not all';
    document.documentElement.dataset.palette = selected;
    document.querySelector('meta[name="theme-color"]').content = {blue:'#faf9f6',green:'#f8f9f6',brand:'#faf8f2',morandi:'#f7f4ef',khaki:'#f5f0e7',navy:'#F5F4F0'}[selected];
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.paletteChoice === selected)));
  }
  selectPalette(new URLSearchParams(location.search).get('palette'));
  choices.forEach(button => button.addEventListener('click', () => selectPalette(button.dataset.paletteChoice)));
})();
