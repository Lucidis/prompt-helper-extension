import {runtime, storage} from 'webextension-polyfill';
import { sendMessage, onMessage } from 'webext-bridge'; 
import '/src/themeHandler.js';
import { applyTheme } from '../themeHandler';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { uniq } from 'lodash';
//injecting css here is the way to do HMR properly in a chrome extension
import './inject.css'
import { current } from '../../node_modules/tailwindcss/colors';

let injected = function () {
  return !!document.querySelector("#prompt-helper-btn");
};
let IMAGES_URL = runtime.getURL("img/");
let extension_url = runtime.getURL("");
let template = `
<button id="prompt-helper-btn" tabindex="0" class="btn btn-small btn-filled btn-primary" type="button">
	<span class="btn-label-wrap">
		<span class="btn-label-inner">
    Prompt Helper</span> 
	</span>
</button>

<a id="gpt3-synonym" data-selection="" class="btn btn-small btn-filled btn-primary">Synonym with GPT-3

</a>
<a id="gpt3-autocomplete" class="btn btn-small btn-outlined ">Autocomplete with GPT-3</a>

<a id="options-link" href="${extension_url}options.html" target="_blank" class="btn btn-small btn-icon btn-options">
<svg xmlns="http://www.w3.org/2000/svg" style="pointer-events:none" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
</svg>

<span class="btn-spinner"
      ><div class="spinner">
        <svg
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 1024 1024"
          class="spinner-spin"
          color="currentColor"
          height="1.2em"
          width="1.2em"
          xmlns="http://www.w3.org/2000/svg"
          style="color: currentcolor"
        >
          <path
            d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"
          ></path>
        </svg></div
    ></span>
</a>
`;


let darkModeToggle = `
<div class="dark-mode-toggle">
  <div class="dark-mode-active"></div>
  <div id="light-mode" class="btn btn-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" />
    </svg>
  </div>
  <div id="dark-mode" class="btn btn-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  </div>
</div>
`

let constructUi = function () {
  let htmlResult = ``;
  if (!window.prompts) {
    htmlResult = "<div>Something went wrong, no prompts found!</div>";
  } else {
    htmlResult = document.createDocumentFragment();
    let container = document.createElement("div");
    container.classList.add("helper-drawer");
    
    container.id = "prompt-helper-drawer";

    container.insertAdjacentHTML("afterBegin", `<div class="helper-drawer-header"></div>`);
    htmlResult.appendChild(container);
    htmlResult
        .querySelector(".helper-drawer-header")
        .insertAdjacentHTML("beforeEnd",darkModeToggle)
    
    let categories = uniq(Object.values(window.prompts).map(x => {
      if (x.category) {
        return `<a href="#" data-scroll-to="${x.category}" class="category-link btn btn-small btn-outlined">${x.category}</a>`;
      }
    })); 

    htmlResult
      .querySelector(".helper-drawer-header")
      .insertAdjacentHTML("afterBegin", `<div class="categories"> <span class="categories-title">Prompt Categories: </span>${categories.join(' ')}  </div>`);
    
    for (let prompt in window.prompts) {
      let promptObj = window.prompts[prompt];
      let promptHtml = `
        <section class="prompt-group" id="${promptObj.category}">
				<h4 class="prompt-group-title" title="${promptObj.description}">${promptObj.title}</h4>
				
				<div class="prompt-group-items" data-prefix="${promptObj.prefix}" data-scroll="${promptObj.category}" data-suffix="${promptObj.suffix}">`;
      for (let item of promptObj.items) {
        promptHtml += `<a 
                class="prompt-group-item ${!item.img ? "body-small link-style" : ""} " 
								title="cmd+click to randomize : ${item.description}"
								data-title="${item.title}"
                ${item.prefix ? "data-prefix='"+item.prefix+"'" : ""} 
                ${item.suffix ? "data-suffix='"+item.suffix+"'" : ""} 
                
								data-variants="${item.variants.join(",")}"
								data-type="${item.type}">${item.title}`;
        if (item.img) 
        {
            promptHtml += `<div class="preview-image"><img id="main-image" src="${IMAGES_URL}${item.img}" alt="${item.title}"/>`;
            if (item.img1) 
            {
                promptHtml += `<div class="bonus-image-1"><img src="${IMAGES_URL}${item.img1}" alt="${item.title}"/></div>`;
            }
                if (item.img2) 
            {
                promptHtml += `<div class="bonus-image-2"><img src="${IMAGES_URL}${item.img2}" alt="${item.title}"/></div>`;
            }
                if (item.img3) 
            {
                promptHtml += `<div class="bonus-image-3"><img src="${IMAGES_URL}${item.img3}" alt="${item.title}"/></div>`;
            }
            promptHtml += '</div>';
        }
          promptHtml += `</a>`;
      }
      promptHtml += `</div></section>`;
      htmlResult
        .querySelector("#prompt-helper-drawer")
        .appendChild(
          document.createRange().createContextualFragment(promptHtml)
        );
    }
  }
  return htmlResult;
};

let inject = async function () {

  let form = document.querySelector(".image-prompt-form");
  let header = document.querySelector(".image-prompt-form-header");
  let container = header.querySelector("div:first-child>div");
  container.insertAdjacentHTML("beforeend", template);

  let wrapper = document.querySelector(".image-prompt-form-wrapper");
  wrapper.append(constructUi());

  applyTheme()

  let input = document.querySelector(".image-prompt-input");


  container.addEventListener("click", async function (e) {

    if (e.target.id == "prompt-helper-btn") {
      document.querySelector("#prompt-helper-drawer").classList.toggle("open");
    }
    
    if (e.target.id == "gpt3-synonym") {
      document.querySelector('.btn-options').classList.add('loading');
      
      let selection = e.target.dataset.selection;
      let synonym = await sendMessage('get-synonym', {value: selection}, 'background');
      input.value = input.value.replace(input.value.substring(input.selectionStart, input.selectionEnd), synonym);
      
      document.querySelector('.btn-options').classList.remove('loading');
      setNativeValue(input, input.value); 
      let position = input.value.indexOf(synonym);
      console.log(position, input.value, synonym)
      input.setSelectionRange(position,position+synonym.length, 'forward');
      input.focus();
    }
    if (e.target.id == "gpt3-autocomplete") {
      let value = input.value;
      document.querySelector('.btn-options').classList.add('loading');
      let response = await sendMessage("get-autocomplete", { value: value }, 'background');
      document.querySelector('.btn-options').classList.remove('loading');
      //join into a single string, all strings and nested arrays in the response
      let autocomplete = response.map(item => {
        if (Array.isArray(item)) {
          let random = item[Math.floor(Math.random() * item.length)];
          return random; 
        }else{
          return item;
        }
      })
      
      input.value = autocomplete.join(" ")
      setNativeValue(input, input.value);
      input.focus();
    }
    
  });
  
  input.addEventListener("keyup", checkForSelection)
  input.addEventListener("mousedown", checkForSelection)
  input.addEventListener("mousemove", checkForSelection)

  document
    .querySelector("#prompt-helper-drawer")
    .addEventListener("click", function (e) {
      if(e.target.matches(".category-link")){
        let category = e.target.dataset.scrollTo;
        let t = document.querySelector(`[data-scroll="${category}"]`);
        t.scrollIntoView({behavior: "smooth", block: "end"});
        document.querySelector("#prompt-helper-drawer").scrollTo({top: t.offsetTop - 120, behavior: "smooth"});
      }
      
      let suffix = e.target.dataset.suffix || e.target.parentNode.dataset.suffix || "";
      let prefix = e.target.dataset.prefix || e.target.parentNode.dataset.prefix || "";
      let is_command_down = e.metaKey || e.ctrlKey;
      if(input.selectionStart != input.selectionEnd) {
        input.value = input.value.replace(input.value.substring(input.selectionStart, input.selectionEnd),"");
      }
      let string = input.value;

      if (e.target.dataset.type == "random" || is_command_down) {
        let variants = e.target.dataset.variants.split(",");
        let random = variants[Math.floor(Math.random() * variants.length)];
        input.value += `${prefix}${random}${suffix}`;
      }
      if (e.target.dataset.type == "toggle" && !is_command_down) {
        let string = `${prefix}${e.target.dataset.title}${suffix}`;

        input.value.includes(string)
          ? (input.value = input.value.replace(string, ""))
          : (input.value += string); 
      }
      
      if (e.target.id == "light-mode") {
        applyTheme('light');
      }
      if (e.target.id == "dark-mode") {
        applyTheme('dark');
      }

      setNativeValue(input, input.value);
      input.focus();
    });

    
};

let injectDownloadButton = async function () {
  let downloadButton = document.createElement("div");
  downloadButton.id = "download-button";
  downloadButton.className = "body-small link-style";
  downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
  <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
</svg>&nbsp;Download Zip with Images`;
  downloadButton.addEventListener("click", async function (e) {
    let input = document.querySelector(".image-prompt-input");
    let value = input.value;
    
    var zip = new JSZip();
    zip.file(`${value}.txt`, `Prompt: ${value}\r\nUrl: ${window.location.href}`);
    
    let images = document.querySelectorAll(".task-page-generations-grid img");
    let signature = document.createElement('img');
    let url = svgToDataURL(document.querySelector(".image-signature").outerHTML);
    await storage.local.get().then(function (result) { 
      console.log(result);
      //read storage and include or exclude watermark based on preference
      signature.src = (result.watermark !== 'exclude') ? url : '';
    });
    
    for (let i = 0; i < images.length; i++) {
      let img = images[i];
      let canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024;
      let ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      ctx.drawImage(signature, canvas.width-80, canvas.height-16);
      let blob = await new Promise((resolve, reject) => {
        canvas.toBlob(resolve, "image/png");
      })
      zip.file(`${i}.png`, blob);
    }
    
    let zipContent = await zip.generateAsync({type:"blob"})
    saveAs(zipContent, `${value}.zip`);
  });
  document.querySelector(".task-page-generations").appendChild(downloadButton);
}


// Creates a button on the Collection / Favorites page that automatically downloads all images
let injectBulkDownloadButton = async function () {
    let bulkDownloadButton = document.createElement("div");
    bulkDownloadButton.id = "bulk-download-button";
    bulkDownloadButton.className = "body-small link-style";
    bulkDownloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
  <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
</svg>&nbsp;Download Collection to Zip`;
    bulkDownloadButton.addEventListener("click", async function (e) {

        // Automatically scrolls down the page with slight delays during scrolling to give new content time to load
        // When it detects that the page has no more content to load, it will run the image scraper function
        var notChangedStepsCount = 0;
        var scrollInterval = setInterval(function () {
            if ((document.documentElement.scrollTop + window.innerHeight) != document.documentElement.scrollHeight) {
                // scrolling
                notChangedStepsCount = 0;
                document.documentElement.scrollTop = document.documentElement.scrollHeight;
            }
            else if (notChangedStepsCount > 3) {
                // no more space to scroll
                document.documentElement.scrollTop = 0;
                clearInterval(scrollInterval);
            }
            else if (notChangedStepsCount == 3) {
                imageScraper();
                notChangedStepsCount++;
            }
            else if (notChangedStepsCount < 3) {
                // waiting for possible extension (autoload) of the page
                document.documentElement.scrollTop += -100;
                document.documentElement.scrollTop += 100;
                notChangedStepsCount++;
            }
        }, 1000);
    });
    document.querySelector(".my-collection-tabs").appendChild(bulkDownloadButton);

    // Necessary CSS alteration to enable scrolling via javascript
    const root = document.querySelector("#root");
    root.style.height = "auto";
}

async function imageScraper() {
    // References all of the images in the collection
    let images = document.querySelectorAll(".generated-image img");
    let imageCount = images.length;

    // Images must be downloaded in batches to avoid running out of memory in very large collections
    // Batches greater than 1000 images are very likely to crash
    if (imageCount <= 1000) {
        var totalBatches = 1;
    }
    else if (imageCount % 1000 == 0) {
        var totalBatches = imageCount / 1000;
    }
    else {
        var totalBatches = (imageCount / 1000) + 1;
    }
    let currentBatch = 0;

    // Index to be incremented while processing images. iLimit controls for batch size.
    let i = 0;
    let iLimit = 1000;

    // Displays report of number of images processed, batch number, and download percentage
    let progressBar = document.createElement("div");
    progressBar.id = "progress-bar";
    document.querySelector("#bulk-download-button").appendChild(progressBar)

    // Reference to the button that will be "clicked" on to discover prompt information
    let detailedImage = document.querySelectorAll('.paginated-generations-item');

    // Begins the image collection process
    imageCollector(images, imageCount, totalBatches, currentBatch, i, iLimit, detailedImage);
}

async function imageCollector(images, imageCount, totalBatches, currentBatch, i, iLimit, detailedImage) {
    var zip = new JSZip();

    let signature = document.createElement('img');
    let url = svgToDataURL(document.querySelector(".image-signature").outerHTML);
    await storage.local.get().then(function (result) {
        console.log(result);
        //read storage and include or exclude watermark based on preference
        signature.src = (result.watermark !== 'exclude') ? url : '';
    });

    // Indicates that there are more batches to process after this cycle
    if (imageCount >= iLimit) {
        for (i; i < iLimit; i++) {
            // Automatically clicks on each image in the collection to expose prompt details
            detailedImage[i].click();

            // Normal generations and image edits have their prompt text saved to a txt file
            if (document.querySelector("h3")) {
                let promptText = document.querySelector("h3").textContent;
                zip.file(`${imageCount - i}.txt`, `Prompt: ${promptText}`);
            }
            // Obtains prompt text for variation images does not seem possible, so a URL to the original image is saved instead
            else {
                let variantSource = document.querySelector(".gen-detail-prompt-img").innerHTML;
                variantSource = variantSource.slice(100);
                variantSource = variantSource.replace('"><svg xmlns="http://www.w3.org/2000/svg" width="80" height="16" viewBox="0 0 80 16" class="image-signature"><path d="M0 0h16v16H0z" fill="#ff6"></path><path d="M16 0h16v16H16z" fill="#42ffff"></path><path d="M32 0h16v16H32z" fill="#51da4c"></path><path d="M48 0h16v16H48z" fill="#ff6e3c"></path><path d="M64 0h16v16H64z" fill="#3c46ff"></path></svg><div class="prompt-img-overlay"></div><div class="prompt-img-header caption">ORIGINAL</div></div>', '');
                for (let j = 0; j < 13; j++) {
                    variantSource = variantSource.replace('&amp;', '&');
                }
                zip.file(`${imageCount - i}.txt`, `Variant Source Image Link: ${variantSource}`);
            }
            // Continuously updates the progress report
            document.getElementById('progress-bar').innerText = 'Images Processed: ' + i.toString() + ' / ' + imageCount.toString();

            // Image processing
            let img = images[i];
            let canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1024;
            let ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            ctx.drawImage(signature, canvas.width - 80, canvas.height - 16);
            let blob = await new Promise((resolve, reject) => {
                canvas.toBlob(resolve, "image/png");
            })
            zip.file(`${imageCount - i}.png`, blob);
        }
        currentBatch++;
        let zipContent = await zip.generateAsync({ type: "blob", streamFiles: true }, function updateCallback(metadata) {
            document.getElementById('progress-bar').innerText = 'Downloading batch ' + currentBatch.toString() + ' of ' + totalBatches.toString() + '... ' + metadata.percent.toFixed(2).toString() + '%';
        })
        saveAs(zipContent, `Collection Batch ${currentBatch}.zip`);
        iCount += 1000;

        // Begins the image collection process again while retaining progress
        imageCollector(images, imageCount, totalBatches, currentBatch, i, iLimit, detailedImage);
    }
    // Same process as above, but for the final (or only) batch
    else {
        for (i; i < imageCount; i++) {
            detailedImage[i].click();
            if (document.querySelector("h3")) {
                let promptText = document.querySelector("h3").textContent;
                zip.file(`${imageCount - i}.txt`, `Prompt: ${promptText}`);
            }
            else {
                let variantSource = document.querySelector(".gen-detail-prompt-img").innerHTML;
                variantSource = variantSource.slice(100);
                variantSource = variantSource.replace('"><svg xmlns="http://www.w3.org/2000/svg" width="80" height="16" viewBox="0 0 80 16" class="image-signature"><path d="M0 0h16v16H0z" fill="#ff6"></path><path d="M16 0h16v16H16z" fill="#42ffff"></path><path d="M32 0h16v16H32z" fill="#51da4c"></path><path d="M48 0h16v16H48z" fill="#ff6e3c"></path><path d="M64 0h16v16H64z" fill="#3c46ff"></path></svg><div class="prompt-img-overlay"></div><div class="prompt-img-header caption">ORIGINAL</div></div>', '');
                for (let j = 0; j < 13; j++) {
                    variantSource = variantSource.replace('&amp;', '&');
                }
                zip.file(`${imageCount - i}.txt`, `Variant Source Image Link: ${variantSource}`);
            }

            document.getElementById('progress-bar').innerText = 'Images Processed: ' + i.toString() + ' / ' + imageCount.toString();
            let img = images[i];
            let canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1024;
            let ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            ctx.drawImage(signature, canvas.width - 80, canvas.height - 16);
            let blob = await new Promise((resolve, reject) => {
                canvas.toBlob(resolve, "image/png");
            })
            zip.file(`${imageCount - i}.png`, blob);
        }
        currentBatch++;
        let zipContent = await zip.generateAsync({ type: "blob", streamFiles: true }, function updateCallback(metadata) {
            document.getElementById('progress-bar').innerText = 'Downloading batch ' + currentBatch.toString() + ' of ' + totalBatches.toString() + '... ' + metadata.percent.toFixed(2).toString() + '%';
        })
        saveAs(zipContent, `Collection Batch ${currentBatch}.zip`);
    }
}

let injectWebhookButton = async function () {
 
  let webhookButton = document.createElement("div");
  webhookButton.id = "webhook-button";
  webhookButton.className = "body-small link-style";
  webhookButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
</svg> <span class="btn-spinner"><div class="spinner">
<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" class="spinner-spin" color="currentColor" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg" style="color: currentcolor">
  <path d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"></path>
</svg></div></span>
&nbsp; Post to webhook`;
  webhookButton.addEventListener("click", async function (e) {
    let input = document.querySelector(".image-prompt-input");
    let value = input.value;
    webhookButton.classList.toggle("loading", true);
  
    let images = document.querySelectorAll(".task-page-generations-grid img");
    let signature = document.createElement('img');
    let url = svgToDataURL(document.querySelector(".image-signature").outerHTML);
    await storage.local.get().then(function (result) { 
      //read storage and include or exclude watermark based on preference
      signature.src = (result.watermark !== 'exclude') ? url : '';
    });
    
    let imagesInDataURI = [];
    for (let i = 0; i < images.length; i++) {
      let img = images[i];
      let canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024;
      let ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(signature, canvas.width-80, canvas.height-16, 80, 16);
      imagesInDataURI.push(canvas.toDataURL("image/png"));
    }
   
      sendMessage('post-webhook', {prompt:value, url: window.location.href, files: imagesInDataURI}, 'background').then(function (response) {
        
      }).finally(function () {
        webhookButton.classList.toggle("loading", false);
      })  
  });
  document.querySelector(".task-page-generations").appendChild(webhookButton);
  let {webhookurl} = await storage.local.get("webhookurl")
  if(!webhookurl){
    webhookButton.style.display = "none";
  }
}

var observer = new MutationObserver((mutationsList) => {
  for (var mutation of mutationsList) {
    // Observing the input to close out the drawer when the user submits the form
    if (mutation.type == "childList" && mutation.addedNodes.length > 0) {
      //iterate through the added nodes
      for (var i = 0; i < mutation.addedNodes.length; i++) {
        let classes = mutation.addedNodes[i].classList;
        if (classes?.contains("edit-page") || classes?.contains("edit-page")) {
          document.querySelector("#prompt-helper-drawer")?.classList.remove("open");
        }
      }

      // check if .task-page-generations is present
        if (document.querySelector(".task-page-flag-desktop") && !document.querySelector("#download-button")) {
        injectDownloadButton();
      }
        if (document.querySelector(".paginated-generations") && !document.querySelector("#bulk-download-button")) {
        injectBulkDownloadButton();
      }
      // check if .task-page-generations is present
        if (document.querySelector(".task-page-flag-desktop") && !document.querySelector("#webhook-button")) {
        injectWebhookButton();
      }
    }

    /* Observing the page to inject the template if needed on change of SPA */
    if (injected()) return;
    let form = document.querySelector(".image-prompt-form");
    if (form != null) {
      inject();
    }
  }
});
const config = { childList: true, subtree: true };
observer.observe(document.body, config);

// helper methods

function setNativeValue(element, value) {
  let lastValue = element.value;
  element.value = value;
  let event = new Event("input", { target: element, bubbles: true });
  // React 15
  event.simulated = true;
  // React 16
  let tracker = element._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }
  element.dispatchEvent(event);
}

function checkForSelection(){
  let input = document.querySelector(".image-prompt-input");
  let gpt_btn = document.querySelector("#gpt3-synonym");
    if(input.selectionStart != input.selectionEnd){
      gpt_btn.classList.add("selection");
      gpt_btn.dataset.selection = input.value.substring(input.selectionStart, input.selectionEnd);
    }else{
      gpt_btn.classList.remove("selection");
      gpt_btn.dataset.selection = ""; 
    }
}
const svgToDataURL = svgStr => {
	const encoded = encodeURIComponent(svgStr)
		.replace(/'/g, '%27')
		.replace(/"/g, '%22')

	const header = 'data:image/svg+xml,'
	const dataUrl = header + encoded

	return dataUrl
}