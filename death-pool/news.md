# Dang's Deathpool Round 5

<style>
  /* General Accordion Style */
  .accordion {
    cursor: pointer;
    padding: 15px;
    border: 1px solid #ddd;
    outline: none;
    text-align: left;
    font-size: 16px;
    font-weight: bold;
    width: 100%;
    background-color: #f9f9f9;
    transition: background-color 0.3s, border-color 0.3s;
    margin-bottom: 8px;
    border-radius: 5px;
  }

  .accordion:hover {
    background-color: #f0f0f0;
    border-color: #bbb;
  }

  .accordion:focus {
    outline: 3px solid #555;
  }

  /* Accordion Content */
  .accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out;
    border-left: 1px solid #ddd;
    border-right: 1px solid #ddd;
    border-bottom: 1px solid #ddd;
    border-radius: 0 0 5px 5px;
    padding: 0 15px;
    background-color: #fafafa;
  }

  .accordion.open .accordion-content {
    max-height: 500px; /* Adjust to iframe height */
    overflow: visible;
  }

  iframe {
    width: 100%;
    height: 400px; /* Adjust height as needed */
    border: none;
    margin-top: 10px;
  }
</style>

<div>
  <button class="accordion" onclick="toggleAccordion(this)">
    Puff Daddy - Dang
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=puff%20daddy%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Julie Andrews - Tracy
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=julie%20andrews%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Noam Chomsky - Derek
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=noam%20chomsky%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Kay Granger - Hailey
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=kay%20granger%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Pope Francis - Pat
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/images/search?q=st+patrick+frowning"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Mel Brooks - Sarah
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=Mel%20Brooks%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    David Attenborough - Alex
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=David%20Attenborough%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Reginald VelJohnson - Hiren
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=Reginald%20VelJohnson%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Dick Van Dyke - Bobby
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=dick%20van%20dyke%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Jack Nicholson - Anthony
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=Jack%20Nicholson%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Yoko Ono - Joe
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=Yoko%20Ono%20health%20updates"></iframe>
  </div>

  <button class="accordion" onclick="toggleAccordion(this)">
    Gene Hackman - Matt
  </button>
  <div class="accordion-content">
    <iframe src="https://www.bing.com/news/search?q=Gene%20Hackman%20health%20updates"></iframe>
  </div>
</div>

<script>
  function toggleAccordion(element) {
    element.classList.toggle('open');
    const content = element.nextElementSibling;
    if (content.style.maxHeight) {
      content.style.maxHeight = null;
    } else {
      content.style.maxHeight = content.scrollHeight + 'px';
    }
  }
</script>
