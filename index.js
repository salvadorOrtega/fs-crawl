const fs = require('fs');
const path = require('path');

const crawl = {};

crawl.listContents = absoluteDirPath => new Promise((resolve, reject) => {
  fs.readdir(absoluteDirPath, function(err, contents){
    if (!err) {
      resolve(contents);
    } else {
      reject(err);          
    }
  })
});

crawl.isDirectory = absolutePath => new Promise((resolve, reject) => {
  fs.stat(absolutePath, (err, stats) => {
    if (err) {
      reject(err);
    } else {
      resolve(stats.isDirectory());
    }
  })
});

crawl.crawlDir = async (absolutePath, onFileCallback = null, onDirCallback = null, options = null) => {
  const crawlOptionDefaults = {awaitCallbacks: true, parentBeforeChild: false, pathKeys: false};

  // Overwrite defaults only with those options that were provided
  options = {...crawlOptionDefaults, ...options};

  const isDirectory = await crawl.isDirectory(absolutePath);
  if (!isDirectory) {
    if (onFileCallback !== null){
      if (options.awaitCallbacks) {
        await onFileCallback(absolutePath);
      } else {
        onFileCallback(absolutePath);
      }
    }
    return null;
  } else {
    const contents = await crawl.listContents(absolutePath);
    if (onDirCallback !== null && options.parentBeforeChild){
      if (options.awaitCallbacks){
        await onDirCallback(absolutePath);
      } else {
        onDirCallback(absolutePath);
      }
    }
    const dirObj = {};
    const allPromise = await Promise.all(contents.map(async each => {
      const pathToEach = path.join(absolutePath, each);
      const inner = await crawl.crawlDir(pathToEach, onFileCallback, onDirCallback, options);
      if (!options.pathKeys){
        dirObj[path.basename(pathToEach)] = inner;
      } else {
        dirObj[pathToEach] = inner;
      }
    }));
    if (onDirCallback !== null && !options.parentBeforeChild){
      if (options.awaitCallbacks){
        await onDirCallback(absolutePath);
      } else {
        onDirCallback(absolutePath);
      }
    }
    return dirObj;
  }
};

crawl.crawlDirObj = async (obj, onParentCallback = null, onChildCallback = null, options = null) => {
  const crawlOptionDefaults = {
    awaitCallbacks: true, 
    parentBeforeChild: false, // not yet used in this function
    depth: 0, 
    afterDir: () => Promise.resolve(), 
    awaitAfterDepth: true
  };
  options = {...crawlOptionDefaults, ...options};
  const fileChildren = [];
  const dirChildren = [];
  for(let key in obj){
    if (obj[key] === null){
      fileChildren.push(key);
    } else {
      dirChildren.push(key);
    }
  }
  if (fileChildren.length > 0){
    for(let fileChild of fileChildren){
      if (options.awaitCallbacks){
        await onChildCallback(fileChild, options);
      } else {
        onChildCallback(fileChild, options);
      }
    }
  }
  if (dirChildren.length > 0){
    for(let dirChild of dirChildren){
      if (options.awaitCallbacks){
        await onParentCallback(dirChild, options);
      } else {
        onParentCallback(dirChild, options);
      }
      await crawl.crawlDirObj(obj[dirChild], onParentCallback, onChildCallback, options)
    }
  }
  if (options.awaitAfterDepth) {
    await options.afterDir(options);
  } else {
    options.afterDir(options);
  }
  return Promise.resolve();
};


crawl.objToDir = (obj, basePath) => new Promise((resolve, reject) => {
  let runningPath = path.join(basePath);

  if (!path.isAbsolute(runningPath)){
    reject(`ERR: Path argument is not absolute`);
  }

  const onDirCallback = (res, options) => new Promise((resolve, reject) => {
    const pathName = path.join(runningPath, res);
    fs.mkdir(pathName, err => {
      runningPath = path.join(runningPath, res);
      if (!err) {
        resolve();
      }
      else {
        console.log(`ERR making dir ${pathName}`);
        reject(err)
      };
    })
  });
  const onFileCallback = (res, options) => new Promise((resolve, reject) => {
    const filePath = path.join(runningPath, res);
    fs.writeFile(filePath, '', err => {
      if (!err) {
        resolve();
      }
      else {
        console.log(`ERR writing: ${filePath}`);
        reject(err);
      }
    })
  });
  const afterDir = () => new Promise((resolve, reject) => {
    runningPath = path.join(runningPath, '../');
    resolve();
  })

  crawl.crawlDirObj(obj, onDirCallback, onFileCallback, {awaitCallbacks: true, afterDir: afterDir, awaitAfterDepth: true})
  .then(() => {
    resolve();
  })
  .catch(err => {
    console.log(err);
  })
});


crawl.dirToObj = (absDirPath, pathKeys = false) => new Promise((resolve, reject) => {
  crawl.crawlDir(absDirPath, null, null, {pathKeys: pathKeys})
  .then(obj => resolve(obj))
  .catch(err => reject(err));
});

// TODO: option to find without file extension in name or using Regex;
// WARNING: operation might be very expensive and slow.
// Find way to kill process after fileName has been found
/* crawl.findFilename = (fileName, dirToCrawl) => new Promise((resolve, reject) => {
  if (!path.isAbsolute(dirToCrawl)){
    reject(`ERR: path ${dirToCrawl} is not absolute`);
    return;
  }
  const checkFileName = absPathReached => {

  }
  ///crawl.crawlDir()
  
}) */

/* MORE TODO: */
/* 
--> crawl.findDirname()

--> crawl.tree() to pretty-print contents of directory

/* Copies folders and files from one path to another but all files are empty */
crawl.copyEmptyStructure = (fromPath, toPath) => new Promise((resolve, reject) => {
  crawl.dirToObj(fromPath)
  .then(dirObj => {
    crawl.objToDir(dirObj, toPath)
    .then(() => resolve())
  })
  .catch(err => reject(err));
});

/* 
WARNING: does not copy directory metadata, but does so for files at it copies using fs.copyFile behavior
*/
crawl.copy = (fromPath, toPath) => new Promise((resolve, reject) => {
  fromPath = path.normalize(fromPath);
  toPath = path.normalize(toPath);

  crawl.dirToObj(fromPath, false)
  .then(dirObject => {
    newDirObj = {};
    newDirObj[path.basename(fromPath)] = dirObject;
    crawl._copyController(fromPath, toPath, newDirObj)
    .then(() => {
      resolve();
    })
    .catch(err => {
      reject(err);
    })
  })
  .catch(err => {
    console.log(err);
    reject(err);
  })
});

crawl._copyController = (fromPath, toPath, obj) => new Promise((resolve, reject) => {
  let runningDestPath = path.join(toPath);
  let runningFromPath = path.join(fromPath,'../'); // goes back one level to accout for having added the new dir to toPath

  if (!path.isAbsolute(runningDestPath)){
    reject(`ERR: Path argument is not absolute`);
  }

  const onDirCallback = (res, options) => new Promise((resolve, reject) => {
    const pathName = path.join(runningDestPath, res);
    runningDestPath = path.join(runningDestPath, res);
    runningFromPath = path.join(runningFromPath, res);
    fs.mkdir(pathName, err => {
      if (!err) {
        resolve();
      }
      else {
        console.log(`ERR making dir ${pathName}`);
        reject(err)
      };
    })
  });
  const onFileCallback = (res, options) => new Promise((resolve, reject) => {
    const newFilePath = path.join(runningDestPath, res);
    const fromFilePath = path.join(runningFromPath, res);
    fs.copyFile(fromFilePath, newFilePath, err => {
      if (!err){
        resolve();
      } else {
        reject(err);
      }
    })
  });
  const afterDir = () => new Promise((resolve, reject) => {
    runningDestPath = path.join(runningDestPath, '../');
    runningFromPath = path.join(runningFromPath, '../');
    resolve();
  });
  
  crawl.crawlDirObj(obj, onDirCallback, onFileCallback, {awaitCallbacks: true, afterDir: afterDir, awaitAfterDepth: true})
  .then(() => {
    resolve();
  })
  .catch(err => {
    console.log(err);
  })
});

crawl.remove = (absPath, options) => new Promise((resolve, reject) => {
  const dirFoundPathCallback = dirFoundPath => new Promise((resolve, reject) => {
    fs.rmdir(dirFoundPath, err => {
      if (err){
        console.log(`ERR: [crawl] could not remove ${dirFoundPath}`)
        reject(err);
      } else {
        resolve();
      }
    })
  });

  const fileFoundPathCallback = fileFoundPath => new Promise((resolve, reject) => {
    fs.unlink(fileFoundPath, err => {
      if (err){
        console.log(`ERR: [crawl] could not unlink ${fileFoundPath}`);
        reject(err);
      } else {
        resolve();
      }
    })
  });

  crawl.crawlDir(absPath, fileFoundPathCallback, dirFoundPathCallback, options)
  .then(nonExistentDirObj => {
    resolve(nonExistentDirObj)
  })
  .catch(err => {
    reject(err)
  })
});

module.exports = crawl;