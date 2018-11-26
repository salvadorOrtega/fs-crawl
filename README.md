# fs-crawl
File system operations utilities for node.js that calls your functions on different events for more versatility.

## API

The motivation for fs-crawl's API is to be able to run callback functions when crawling a directory in an asynchronous and promised fashion.

fs-crawl uses this model to, for example, create an entire directory structure from an object:

```javascript
const myDirectoryObj = {
  'daddyFolder': {
    'child.txt': null,  
    'child2.txt': null,
    'childDir1': {
      'grandChild.txt': null
    },
    'childDir2': {}
  },
  'uncleFolder': {},
}

```
Notice fs-crawl expects the following: 
  * file names must point to `null`
  * a key pointing to an empty object means that key specifies an empty directory

Storing the fs-crawl export in a variable called crawl, and specifying a destination called `intoDirPath`, we turn our object into a directory using crawl.objToDir:

```javascript
crawl.objToDir(myDirectoryObj, intoDirPath);
```

In this case crawl.objToDir passes two callback functions to another fs-crawl utility `crawl.crawlDirObj` that visits our entire myDirectoryObj running a callback function that creates a file when `crawl.crawlDirObj` encounters a key that points to null, and running another callback function that creates a directory when `crawl.crawlDirObj` encounters a key that points to another object.

All files at a given depth are handled first, then all subdirectories.

Similarly, fs-crawl has the `remove()` utility that visits a specified absolute path, runs `crawl.crawlDir()` in this case to visit the contents of that directory rather than the contents of an object, and runs two internal callback functions: one that removes a file when one has been found, and another that removes the directory once its depths have been cleared. Basically, fs-crawl gets to all the files at a certain point in the call stack fist, and into the directories depth-first.

`crawl.copyOneToMany(fromPath, destinationsArray)` copies the contents inside `fromPath` into an arbitrary number of destinations listed in destinationsArray. It first runs `crawl.dirToObj` to obtain a copy of the directory structure as an
object (i.e. the opposite of `crawl.objToDir`), then runs callbacks that copy each directory and file it encounters into each of the destinations.

The pattern of running callback functions when a directory or a file is found allows for easily building composable and ever more powerful file system management tools all while staying within the asynchronous and promises territory.